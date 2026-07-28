"use client";

import { useEffect } from "react";

const CARD_SELECTOR = ".dashboard-card, .app-surface:not(.page-header)";
const INTERACTIVE_SELECTOR = "button, input, select, textarea, a, [role='button'], [contenteditable='true']";
const EDGE_SIZE = 8;
const CARD_HEADER_HEIGHT = 58;
const MIN_CARD_HEIGHT = 180;
const MIN_CARD_WIDTH = 280;
const DRAG_ACTIVATION_DISTANCE = 7;
const CARD_REORDER_DELAY = 180;
const CARD_SETTLE_DURATION = 210;
const CARD_LAYOUT_STORAGE_KEY = "ai-cost-audit.card-layout.v1";

type CardResizeState = {
  element: HTMLElement;
  parent: HTMLElement;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  horizontal: boolean;
  vertical: boolean;
};

type TableResizeState =
  | {
      kind: "column";
      table: HTMLTableElement;
      columnIndex: number;
      startX: number;
      startWidth: number;
      startTableWidth: number;
    }
  | {
      kind: "row";
      row: HTMLTableRowElement;
      startY: number;
      startHeight: number;
    };

type DragState = {
  element: HTMLElement;
  parent: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  pointerOffsetX: number;
  pointerOffsetY: number;
  floatingLeft: number;
  floatingTop: number;
  scale: number;
  active: boolean;
  placeholder: HTMLDivElement | null;
  candidate: HTMLElement | null;
  candidateTimer: number | null;
  originalStyle: {
    position: string;
    left: string;
    top: string;
    width: string;
    height: string;
    margin: string;
    transform: string;
    transition: string;
    zIndex: string;
    pointerEvents: string;
    touchAction: string;
    order: string;
  };
};

type SavedCardLayouts = Record<string, Record<string, string[]>>;

export function WorkspaceInteractionLayer() {
  useEffect(() => {
    let cardResize: CardResizeState | null = null;
    let tableResize: TableResizeState | null = null;
    let drag: DragState | null = null;
    let hoveredElement: HTMLElement | null = null;
    let activeColumnMenu: HTMLDivElement | null = null;
    let activeColumnTrigger: HTMLButtonElement | null = null;
    let workspaceRefreshFrame = 0;
    let cardSettleTimer = 0;
    const tablesPendingVisibility = new Set<HTMLTableElement>();

    const root = document.documentElement;
    const workspaceRoot = document.querySelector<HTMLElement>("[data-workspace-root]");
    if (!workspaceRoot) return;
    const workspace: HTMLElement = workspaceRoot;

    const cardObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const card = entry.target as HTMLElement;
        card.classList.toggle("is-card-compact", entry.contentRect.width < 520);
        card.classList.toggle("is-card-wide", entry.contentRect.width >= 820);
      });
    });

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function getDirectCards(parent: HTMLElement) {
      return Array.from(parent.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement && child.matches(CARD_SELECTOR)
      );
    }

    function getCardParents() {
      return Array.from(
        new Set(
          Array.from(workspace.querySelectorAll<HTMLElement>(CARD_SELECTOR))
            .map((card) => card.parentElement)
            .filter((parent): parent is HTMLElement => parent instanceof HTMLElement)
            .filter((parent) => getDirectCards(parent).length > 1)
        )
      );
    }

    function getViewKey() {
      return workspace.dataset.workspaceView || "default";
    }

    function getParentKey(parent: HTMLElement) {
      const index = getCardParents().indexOf(parent);
      return `${getViewKey()}:group:${Math.max(0, index)}`;
    }

    function getCardBaseKey(card: HTMLElement, index: number) {
      const explicitKey = card.dataset.workspaceCardId;
      if (explicitKey) return explicitKey;
      const heading = card.querySelector<HTMLElement>("h1, h2, h3, [data-card-title]");
      const label = heading?.innerText.replace(/\s+/g, " ").trim();
      return label ? label.slice(0, 80) : `card-${index + 1}`;
    }

    function assignCardKeys(parent: HTMLElement) {
      const counts = new Map<string, number>();
      getDirectCards(parent).forEach((card, index) => {
        const baseKey = getCardBaseKey(card, index);
        const occurrence = counts.get(baseKey) ?? 0;
        counts.set(baseKey, occurrence + 1);
        card.dataset.workspaceCardKey = `${baseKey}::${occurrence}`;
      });
    }

    function loadCardLayouts(): SavedCardLayouts {
      try {
        const stored = window.localStorage.getItem(CARD_LAYOUT_STORAGE_KEY);
        return stored ? (JSON.parse(stored) as SavedCardLayouts) : {};
      } catch {
        return {};
      }
    }

    function saveCardLayout(parent: HTMLElement) {
      assignCardKeys(parent);
      const cards = getDirectCards(parent).sort(
        (left, right) => Number(left.style.order || 0) - Number(right.style.order || 0)
      );
      const layouts = loadCardLayouts();
      const viewKey = getViewKey();
      layouts[viewKey] ??= {};
      layouts[viewKey][getParentKey(parent)] = cards.map(
        (card) => card.dataset.workspaceCardKey || ""
      );
      try {
        window.localStorage.setItem(CARD_LAYOUT_STORAGE_KEY, JSON.stringify(layouts));
      } catch {
        // A blocked storage policy should not break card dragging.
      }
    }

    function applySavedCardLayouts() {
      if (drag?.active) return;
      const layouts = loadCardLayouts()[getViewKey()];
      getCardParents().forEach((parent) => {
        assignCardKeys(parent);
        const savedOrder = layouts?.[getParentKey(parent)];
        const cards = getDirectCards(parent);
        if (!savedOrder?.length) {
          cards.forEach((card, index) => {
            if (!card.style.order) card.style.order = String(index);
          });
          return;
        }
        const savedIndex = new Map(savedOrder.map((key, index) => [key, index]));
        cards
          .sort((left, right) => {
            const leftIndex = savedIndex.get(left.dataset.workspaceCardKey || "");
            const rightIndex = savedIndex.get(right.dataset.workspaceCardKey || "");
            return (leftIndex ?? Number.MAX_SAFE_INTEGER) - (rightIndex ?? Number.MAX_SAFE_INTEGER);
          })
          .forEach((card, index) => {
            card.style.order = String(index);
          });
      });
    }

    const observeCards = () => {
      workspace.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach((card) => {
        if (card.dataset.workspaceObserved === "true") return;
        card.dataset.workspaceObserved = "true";
        card.classList.add("workspace-adjustable-card");
        cardObserver.observe(card);
      });
      applySavedCardLayouts();
    };

    function getLeafHeaders(table: HTMLTableElement): HTMLTableCellElement[] {
      const headerRows = table.tHead?.rows;
      if (!headerRows?.length) return [];
      return Array.from(headerRows[headerRows.length - 1].cells);
    }

    function getHiddenColumns(table: HTMLTableElement): Set<number> {
      return new Set(
        (table.dataset.hiddenColumns ?? "")
          .split(",")
          .map(Number)
          .filter((index) => Number.isInteger(index) && index > 0)
      );
    }

    function saveHiddenColumns(table: HTMLTableElement, hidden: Set<number>) {
      table.dataset.hiddenColumns = Array.from(hidden).sort((a, b) => a - b).join(",");
    }

    function applyColumnVisibility(table: HTMLTableElement) {
      const hidden = getHiddenColumns(table);
      Array.from(table.rows).forEach((row) => {
        Array.from(row.cells).forEach((cell, index) => {
          cell.classList.toggle("is-column-hidden", hidden.has(index));
        });
      });
      table.classList.toggle("has-hidden-columns", hidden.size > 0);

      if (hidden.size === 0) {
        const originalWidth = table.dataset.columnMenuOriginalWidth;
        const originalMinWidth = table.dataset.columnMenuOriginalMinWidth;
        const headers = getLeafHeaders(table);
        const restoredWidth = headers.reduce((sum, header) => {
          const width = Number(header.dataset.columnBaseWidth);
          const nextWidth = Number.isFinite(width) && width > 0 ? width : 156;
          header.style.width = `${nextWidth}px`;
          header.style.minWidth = `${nextWidth}px`;
          header.style.maxWidth = `${nextWidth}px`;
          return sum + nextWidth;
        }, 0);
        const fittedWidth = Math.max(table.parentElement?.clientWidth ?? 0, restoredWidth);
        table.style.width = originalWidth && originalWidth !== "__empty__" ? originalWidth : `${fittedWidth}px`;
        table.style.minWidth =
          originalMinWidth && originalMinWidth !== "__empty__" ? originalMinWidth : `${fittedWidth}px`;
        return;
      }

      const visibleWidth = getLeafHeaders(table).reduce((sum, header, index) => {
        if (hidden.has(index)) return sum;
        const storedWidth = Number(header.dataset.columnBaseWidth);
        return sum + (Number.isFinite(storedWidth) && storedWidth > 0 ? storedWidth : 156);
      }, 0);
      const containerWidth = table.parentElement?.clientWidth ?? 0;
      const nextWidth = Math.max(containerWidth, visibleWidth);
      table.style.width = `${nextWidth}px`;
      table.style.minWidth = `${nextWidth}px`;
    }

    function closeColumnMenu() {
      activeColumnMenu?.remove();
      activeColumnTrigger?.setAttribute("aria-expanded", "false");
      activeColumnMenu = null;
      activeColumnTrigger = null;
    }

    function setColumnHidden(table: HTMLTableElement, columnIndex: number, hidden: boolean) {
      if (columnIndex === 0 && hidden) return;
      getLeafHeaders(table).forEach((header) => {
        if (header.getBoundingClientRect().width > 0) {
          header.dataset.columnBaseWidth = String(header.getBoundingClientRect().width);
        }
      });
      const hiddenColumns = getHiddenColumns(table);
      if (hidden) {
        hiddenColumns.add(columnIndex);
      } else {
        hiddenColumns.delete(columnIndex);
      }
      saveHiddenColumns(table, hiddenColumns);
      applyColumnVisibility(table);
      closeColumnMenu();
    }

    function openColumnMenu(trigger: HTMLButtonElement) {
      const header = trigger.closest<HTMLTableCellElement>("th");
      const table = trigger.closest<HTMLTableElement>("table.resizable-table");
      if (!header || !table) return;
      closeColumnMenu();

      const headers = getLeafHeaders(table);
      const hiddenColumns = getHiddenColumns(table);
      const visibleCount = headers.length - hiddenColumns.size;
      const isProtectedColumn = header.cellIndex === 0;
      const menu = document.createElement("div");
      menu.className = "table-column-menu";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", "列选项");

      const hideButton = document.createElement("button");
      hideButton.type = "button";
      hideButton.className = "table-column-menu-item";
      hideButton.textContent = isProtectedColumn
        ? "关键识别列始终显示"
        : `隐藏“${header.dataset.columnLabel || "此列"}”`;
      hideButton.disabled = isProtectedColumn || visibleCount <= 1;
      hideButton.addEventListener("click", () => setColumnHidden(table, header.cellIndex, true));
      menu.appendChild(hideButton);

      if (hiddenColumns.size > 0) {
        const divider = document.createElement("div");
        divider.className = "table-column-menu-divider";
        menu.appendChild(divider);

        const restoreLabel = document.createElement("p");
        restoreLabel.className = "table-column-menu-label";
        restoreLabel.textContent = "恢复隐藏列";
        menu.appendChild(restoreLabel);

        hiddenColumns.forEach((columnIndex) => {
          const hiddenHeader = headers[columnIndex];
          if (!hiddenHeader) return;
          const restoreButton = document.createElement("button");
          restoreButton.type = "button";
          restoreButton.className = "table-column-menu-item";
          restoreButton.textContent = hiddenHeader.dataset.columnLabel || `第 ${columnIndex + 1} 列`;
          restoreButton.addEventListener("click", () => setColumnHidden(table, columnIndex, false));
          menu.appendChild(restoreButton);
        });

        const restoreAllButton = document.createElement("button");
        restoreAllButton.type = "button";
        restoreAllButton.className = "table-column-menu-item table-column-menu-restore-all";
        restoreAllButton.textContent = "恢复全部列";
        restoreAllButton.addEventListener("click", () => {
          saveHiddenColumns(table, new Set());
          applyColumnVisibility(table);
          closeColumnMenu();
        });
        menu.appendChild(restoreAllButton);
      }

      document.body.appendChild(menu);
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      menu.style.top = `${Math.min(window.innerHeight - menuRect.height - 12, triggerRect.bottom + 6)}px`;
      menu.style.left = `${Math.max(12, Math.min(window.innerWidth - menuRect.width - 12, triggerRect.right - menuRect.width))}px`;
      trigger.setAttribute("aria-expanded", "true");
      activeColumnMenu = menu;
      activeColumnTrigger = trigger;
    }

    const enhanceTables = () => {
      workspace.querySelectorAll<HTMLTableElement>("table.resizable-table").forEach((table) => {
        let structureChanged = false;
        const hadProtectedColumnHidden = (table.dataset.hiddenColumns ?? "")
          .split(",")
          .map(Number)
          .some((index) => index === 0);
        const hasStaleProtectedCell = Boolean(
          table.querySelector("tr > :first-child.is-column-hidden")
        );
        if (hadProtectedColumnHidden || hasStaleProtectedCell) {
          saveHiddenColumns(table, getHiddenColumns(table));
          structureChanged = true;
        }
        if (!table.dataset.columnMenuOriginalWidth) {
          table.dataset.columnMenuOriginalWidth = table.style.width || "__empty__";
          table.dataset.columnMenuOriginalMinWidth = table.style.minWidth || "__empty__";
          structureChanged = true;
        }
        getLeafHeaders(table).forEach((header) => {
          if (!header.dataset.columnLabel) {
            header.dataset.columnLabel = header.innerText.replace(/[↑↓↕]/g, "").replace(/\s+/g, " ").trim() || "未命名列";
          }
          if (!header.dataset.columnBaseWidth) {
            header.dataset.columnBaseWidth = String(header.getBoundingClientRect().width || 156);
          }
          if (header.querySelector(":scope > .table-column-menu-trigger")) return;
          structureChanged = true;
          header.classList.add("has-column-menu");
          const trigger = document.createElement("button");
          trigger.type = "button";
          trigger.className = "table-column-menu-trigger";
          trigger.dataset.columnMenuTrigger = "true";
          trigger.setAttribute("aria-label", `${header.dataset.columnLabel}列选项`);
          trigger.setAttribute("aria-haspopup", "menu");
          trigger.setAttribute("aria-expanded", "false");
          trigger.title = "列选项";
          const dots = document.createElement("span");
          dots.setAttribute("aria-hidden", "true");
          dots.textContent = "⋮";
          trigger.appendChild(dots);
          header.appendChild(trigger);
        });
        if (
          structureChanged &&
          (getHiddenColumns(table).size > 0 || hadProtectedColumnHidden || hasStaleProtectedCell)
        ) {
          applyColumnVisibility(table);
        }
      });
    };

    const observeWorkspace = () => {
      observeCards();
      enhanceTables();
    };

    function scheduleWorkspaceRefresh() {
      if (workspaceRefreshFrame) return;
      workspaceRefreshFrame = window.requestAnimationFrame(() => {
        workspaceRefreshFrame = 0;
        observeWorkspace();
        tablesPendingVisibility.forEach((table) => {
          if (table.isConnected && getHiddenColumns(table).size > 0) {
            applyColumnVisibility(table);
          }
        });
        tablesPendingVisibility.clear();
      });
    }

    function handleWorkspaceMutations(mutations: MutationRecord[]) {
      mutations.forEach((mutation) => {
        const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        const ownerTable = target?.closest<HTMLTableElement>("table.resizable-table");
        if (ownerTable && getHiddenColumns(ownerTable).size > 0) {
          tablesPendingVisibility.add(ownerTable);
        }
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          const addedTable = node.matches("table.resizable-table")
            ? (node as HTMLTableElement)
            : node.querySelector<HTMLTableElement>("table.resizable-table");
          if (addedTable && getHiddenColumns(addedTable).size > 0) {
            tablesPendingVisibility.add(addedTable);
          }
        });
      });
      scheduleWorkspaceRefresh();
    }

    observeWorkspace();
    const mutationObserver = new MutationObserver(handleWorkspaceMutations);
    mutationObserver.observe(workspace, { childList: true, subtree: true });

    function getCardEdge(card: HTMLElement, clientX: number, clientY: number) {
      const rect = card.getBoundingClientRect();
      return {
        horizontal: Math.abs(clientX - rect.right) <= EDGE_SIZE,
        vertical: Math.abs(clientY - rect.bottom) <= EDGE_SIZE
      };
    }

    function getTableEdge(target: HTMLElement, clientX: number, clientY: number) {
      const table = target.closest<HTMLTableElement>("table.resizable-table");
      if (!table) return null;
      const header = target.closest<HTMLTableCellElement>("th");
      if (header) {
        const rect = header.getBoundingClientRect();
        if (Math.abs(clientX - rect.right) <= EDGE_SIZE) {
          return { kind: "column" as const, table, header };
        }
      }
      const row = target.closest<HTMLTableRowElement>("tbody tr");
      if (row) {
        const rect = row.getBoundingClientRect();
        if (Math.abs(clientY - rect.bottom) <= 5) {
          return { kind: "row" as const, table, row };
        }
      }
      return null;
    }

    function clearHoverState() {
      hoveredElement?.classList.remove("is-resize-edge");
      hoveredElement = null;
      if (!cardResize && !tableResize && !drag?.active) root.style.cursor = "";
    }

    function setCardDragLock(locked: boolean) {
      root.classList.toggle("is-workspace-card-dragging", locked);
      document.body.classList.toggle("is-workspace-card-dragging", locked);
    }

    function normalizeCardOrders(parent: HTMLElement) {
      getDirectCards(parent)
        .sort((left, right) => Number(left.style.order || 0) - Number(right.style.order || 0))
        .forEach((card, index) => {
          card.style.order = String(index);
        });
    }

    function captureCardRects(parent: HTMLElement, excluded?: HTMLElement) {
      return new Map(
        getDirectCards(parent)
          .filter((card) => card !== excluded)
          .map((card) => [card, card.getBoundingClientRect()])
      );
    }

    function animateCardReflow(rects: Map<HTMLElement, DOMRect>) {
      if (prefersReducedMotion.matches) return;
      window.requestAnimationFrame(() => {
        rects.forEach((previousRect, card) => {
          if (!card.isConnected) return;
          const nextRect = card.getBoundingClientRect();
          const deltaX = previousRect.left - nextRect.left;
          const deltaY = previousRect.top - nextRect.top;
          if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
          card.animate(
            [
              { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
              { transform: "translate3d(0, 0, 0)" }
            ],
            {
              duration: 240,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)"
            }
          );
        });
      });
    }

    function activateCardDrag(state: DragState) {
      normalizeCardOrders(state.parent);
      const rect = state.element.getBoundingClientRect();
      const computedStyle = getComputedStyle(state.element);
      const viewportPadding = 48;
      const availableWidth = Math.max(160, window.innerWidth - viewportPadding * 2);
      const availableHeight = Math.max(160, window.innerHeight - viewportPadding * 2);
      state.scale = Math.max(
        0.12,
        Math.min(0.72, availableWidth / rect.width, availableHeight / rect.height)
      );
      state.floatingLeft = rect.left;
      state.floatingTop = rect.top;
      const placeholder = document.createElement("div");
      placeholder.className = "workspace-card-placeholder";
      placeholder.dataset.cardPlaceholder = "true";
      placeholder.setAttribute("aria-hidden", "true");
      placeholder.style.width = `${rect.width}px`;
      placeholder.style.height = `${rect.height}px`;
      placeholder.style.order = state.element.style.order;
      placeholder.style.gridColumn = state.element.style.gridColumn || computedStyle.gridColumn;
      placeholder.style.gridRow = state.element.style.gridRow || computedStyle.gridRow;
      state.parent.appendChild(placeholder);

      state.placeholder = placeholder;
      state.active = true;
      state.element.style.position = "fixed";
      state.element.style.left = `${rect.left}px`;
      state.element.style.top = `${rect.top}px`;
      state.element.style.width = `${rect.width}px`;
      state.element.style.height = `${rect.height}px`;
      state.element.style.margin = "0";
      state.element.style.zIndex = "1200";
      state.element.style.pointerEvents = "none";
      state.element.style.setProperty("--card-drag-scale", String(state.scale));
      state.element.style.setProperty("--card-drag-origin-x", `${state.pointerOffsetX}px`);
      state.element.style.setProperty("--card-drag-origin-y", `${state.pointerOffsetY}px`);
      state.element.style.setProperty("--card-drag-x", "0px");
      state.element.style.setProperty("--card-drag-y", "0px");
      state.element.classList.add("is-card-dragging");
      positionDraggedCard(state, state.currentX, state.currentY);
      root.style.cursor = "grabbing";
    }

    function positionDraggedCard(state: DragState, clientX: number, clientY: number) {
      const desiredLeft = clientX - state.pointerOffsetX;
      const desiredTop = clientY - state.pointerOffsetY;
      state.element.style.setProperty(
        "--card-drag-x",
        `${desiredLeft - state.floatingLeft}px`
      );
      state.element.style.setProperty(
        "--card-drag-y",
        `${desiredTop - state.floatingTop}px`
      );
    }

    function reorderPlaceholder(state: DragState, target: HTMLElement) {
      const placeholder = state.placeholder;
      if (!placeholder?.isConnected || !target.isConnected) return;
      const beforeRects = captureCardRects(state.parent, state.element);
      const orderedItems = [
        ...getDirectCards(state.parent).filter((card) => card !== state.element),
        placeholder
      ].sort((left, right) => Number(left.style.order || 0) - Number(right.style.order || 0));
      const placeholderIndex = orderedItems.indexOf(placeholder);
      const targetIndex = orderedItems.indexOf(target);
      if (placeholderIndex < 0 || targetIndex < 0) return;

      const targetRect = target.getBoundingClientRect();
      const mostlyVertical =
        Math.abs(state.currentY - (targetRect.top + targetRect.height / 2)) >
        targetRect.height * 0.18;
      const insertAfter = mostlyVertical
        ? state.currentY > targetRect.top + targetRect.height / 2
        : state.currentX > targetRect.left + targetRect.width / 2;

      orderedItems.splice(placeholderIndex, 1);
      const nextTargetIndex = orderedItems.indexOf(target);
      orderedItems.splice(nextTargetIndex + (insertAfter ? 1 : 0), 0, placeholder);
      orderedItems.forEach((item, index) => {
        item.style.order = String(index);
      });
      state.element.style.order = placeholder.style.order;
      animateCardReflow(beforeRects);
    }

    function scheduleCardReorder(state: DragState, target: HTMLElement | null) {
      if (state.candidate === target) return;
      if (state.candidateTimer) window.clearTimeout(state.candidateTimer);
      state.candidate = target;
      state.candidateTimer = null;
      if (!target) return;
      state.candidateTimer = window.setTimeout(() => {
        if (drag !== state || state.candidate !== target) return;
        reorderPlaceholder(state, target);
        state.candidateTimer = null;
      }, CARD_REORDER_DELAY);
    }

    function restoreDraggedCardStyle(state: DragState) {
      const { element, originalStyle } = state;
      element.style.position = originalStyle.position;
      element.style.left = originalStyle.left;
      element.style.top = originalStyle.top;
      element.style.width = originalStyle.width;
      element.style.height = originalStyle.height;
      element.style.margin = originalStyle.margin;
      element.style.transform = originalStyle.transform;
      element.style.transition = originalStyle.transition;
      element.style.zIndex = originalStyle.zIndex;
      element.style.pointerEvents = originalStyle.pointerEvents;
      element.style.touchAction = originalStyle.touchAction;
      element.style.removeProperty("--card-drag-scale");
      element.style.removeProperty("--card-drag-origin-x");
      element.style.removeProperty("--card-drag-origin-y");
      element.style.removeProperty("--card-drag-x");
      element.style.removeProperty("--card-drag-y");
    }

    function finishCardDrag() {
      const state = drag;
      if (!state) return;
      drag = null;
      if (state.candidateTimer) window.clearTimeout(state.candidateTimer);
      try {
        state.element.releasePointerCapture(state.pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
      setCardDragLock(false);
      root.style.cursor = "";

      if (!state.active || !state.placeholder?.isConnected) {
        state.element.classList.remove("is-card-dragging");
        return;
      }

      const placeholder = state.placeholder;
      const destination = placeholder.getBoundingClientRect();
      const finalOrder = placeholder.style.order;
      state.element.classList.add("is-card-settling");
      void state.element.offsetWidth;
      state.element.style.setProperty(
        "--card-drag-x",
        `${destination.left - state.floatingLeft}px`
      );
      state.element.style.setProperty(
        "--card-drag-y",
        `${destination.top - state.floatingTop}px`
      );
      state.element.style.setProperty("--card-drag-scale", "1");

      const completeDrop = () => {
        restoreDraggedCardStyle(state);
        state.element.style.order = finalOrder;
        state.element.classList.remove("is-card-dragging");
        state.element.classList.remove("is-card-settling");
        placeholder.remove();
        normalizeCardOrders(state.parent);
        saveCardLayout(state.parent);
      };

      if (prefersReducedMotion.matches) {
        completeDrop();
      } else {
        cardSettleTimer = window.setTimeout(completeDrop, CARD_SETTLE_DURATION);
      }
    }

    function handlePointerMove(event: PointerEvent) {
      if (tableResize?.kind === "column") {
        const resizeState = tableResize;
        const delta = event.clientX - resizeState.startX;
        const width = Math.max(72, Math.min(480, resizeState.startWidth + delta));
        const appliedDelta = width - resizeState.startWidth;
        const headerRows = resizeState.table.tHead?.rows;
        if (headerRows) {
          Array.from(headerRows).forEach((row) => {
            const cell = row.cells[resizeState.columnIndex] as HTMLTableCellElement | undefined;
            if (cell) {
              cell.style.width = `${width}px`;
              cell.style.minWidth = `${width}px`;
              cell.style.maxWidth = `${width}px`;
            }
          });
        }
        const tableWidth = Math.max(640, resizeState.startTableWidth + appliedDelta);
        resizeState.table.style.width = `${tableWidth}px`;
        resizeState.table.style.minWidth = `${tableWidth}px`;
        return;
      }

      if (tableResize?.kind === "row") {
        const height = Math.max(32, Math.min(160, tableResize.startHeight + event.clientY - tableResize.startY));
        tableResize.row.style.height = `${height}px`;
        return;
      }

      if (cardResize) {
        const { element, parent } = cardResize;
        if (cardResize.horizontal) {
          const parentStyle = getComputedStyle(parent);
          const columns = parentStyle.display.includes("grid")
            ? parentStyle.gridTemplateColumns.split(" ").filter(Boolean).length
            : 0;
          const nextWidth = Math.max(MIN_CARD_WIDTH, cardResize.startWidth + event.clientX - cardResize.startX);
          if (columns > 1) {
            const columnWidth = parent.clientWidth / columns;
            const span = Math.max(1, Math.min(columns, Math.round(nextWidth / columnWidth)));
            element.style.gridColumn = `span ${span}`;
            element.style.width = "";
          } else {
            element.style.width = `${Math.min(parent.clientWidth, nextWidth)}px`;
          }
        }
        if (cardResize.vertical) {
          const nextHeight = Math.max(MIN_CARD_HEIGHT, cardResize.startHeight + event.clientY - cardResize.startY);
          element.style.height = `${nextHeight}px`;
        }
        element.classList.add("is-user-sized");
        return;
      }

      if (drag) {
        const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
        drag.currentX = event.clientX;
        drag.currentY = event.clientY;
        if (!drag.active && distance > DRAG_ACTIVATION_DISTANCE) {
          activateCardDrag(drag);
        }
        if (!drag.active) return;

        event.preventDefault();
        positionDraggedCard(drag, event.clientX, event.clientY);
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(CARD_SELECTOR);
        const validTarget =
          target && target !== drag.element && target.parentElement === drag.parent ? target : null;
        scheduleCardReorder(drag, validTarget);
        return;
      }

      clearHoverState();
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) return;

      const tableEdge = getTableEdge(target, event.clientX, event.clientY);
      if (tableEdge) {
        hoveredElement = tableEdge.kind === "column" ? tableEdge.header : tableEdge.row;
        hoveredElement.classList.add("is-resize-edge");
        root.style.cursor = tableEdge.kind === "column" ? "col-resize" : "row-resize";
        return;
      }

      const card = target.closest<HTMLElement>(CARD_SELECTOR);
      if (!card) return;
      const edge = getCardEdge(card, event.clientX, event.clientY);
      if (edge.horizontal || edge.vertical) {
        hoveredElement = card;
        card.classList.add("is-resize-edge");
        root.style.cursor = edge.horizontal && edge.vertical ? "nwse-resize" : edge.horizontal ? "ew-resize" : "ns-resize";
        return;
      }

      const rect = card.getBoundingClientRect();
      const canDrag = event.clientY - rect.top <= CARD_HEADER_HEIGHT && !target.closest(INTERACTIVE_SELECTOR);
      if (canDrag && (card.parentElement?.querySelectorAll(CARD_SELECTOR).length ?? 0) > 1) {
        root.style.cursor = "grab";
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0 || !(event.target instanceof HTMLElement)) return;
      const target = event.target;
      const columnMenuTrigger = target.closest<HTMLButtonElement>("[data-column-menu-trigger='true']");
      if (columnMenuTrigger) {
        event.preventDefault();
        event.stopPropagation();
        openColumnMenu(columnMenuTrigger);
        return;
      }
      const tableEdge = getTableEdge(target, event.clientX, event.clientY);
      if (tableEdge?.kind === "column") {
        event.preventDefault();
        const headerCells = Array.from(tableEdge.table.tHead?.rows[0]?.cells ?? []);
        if (!tableEdge.table.dataset.originalInlineWidth) {
          tableEdge.table.dataset.originalInlineWidth = tableEdge.table.style.width || "__empty__";
          tableEdge.table.dataset.originalInlineMinWidth = tableEdge.table.style.minWidth || "__empty__";
        }
        headerCells.forEach((cell) => {
          const width = cell.getBoundingClientRect().width;
          cell.style.width = `${width}px`;
          cell.style.minWidth = `${width}px`;
          cell.style.maxWidth = `${width}px`;
        });
        tableResize = {
          kind: "column",
          table: tableEdge.table,
          columnIndex: tableEdge.header.cellIndex,
          startX: event.clientX,
          startWidth: tableEdge.header.getBoundingClientRect().width,
          startTableWidth: tableEdge.table.getBoundingClientRect().width
        };
        root.style.cursor = "col-resize";
        return;
      }
      if (tableEdge?.kind === "row") {
        event.preventDefault();
        tableResize = {
          kind: "row",
          row: tableEdge.row,
          startY: event.clientY,
          startHeight: tableEdge.row.getBoundingClientRect().height
        };
        root.style.cursor = "row-resize";
        return;
      }

      const card = target.closest<HTMLElement>(CARD_SELECTOR);
      if (!card || !card.parentElement) return;
      const edge = getCardEdge(card, event.clientX, event.clientY);
      if (edge.horizontal || edge.vertical) {
        event.preventDefault();
        cardResize = {
          element: card,
          parent: card.parentElement,
          startX: event.clientX,
          startY: event.clientY,
          startWidth: card.getBoundingClientRect().width,
          startHeight: card.getBoundingClientRect().height,
          horizontal: edge.horizontal,
          vertical: edge.vertical
        };
        card.classList.add("is-card-resizing");
        return;
      }

      const rect = card.getBoundingClientRect();
      const canDrag =
        event.clientY - rect.top <= CARD_HEADER_HEIGHT &&
        !target.closest(INTERACTIVE_SELECTOR) &&
        card.parentElement.querySelectorAll(CARD_SELECTOR).length > 1;
      if (canDrag) {
        event.preventDefault();
        event.stopPropagation();
        setCardDragLock(true);
        const originalTouchAction = card.style.touchAction;
        try {
          card.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is unavailable in a few embedded browser environments.
        }
        card.style.touchAction = "none";
        drag = {
          element: card,
          parent: card.parentElement,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          currentX: event.clientX,
          currentY: event.clientY,
          pointerOffsetX: event.clientX - rect.left,
          pointerOffsetY: event.clientY - rect.top,
          floatingLeft: rect.left,
          floatingTop: rect.top,
          scale: 1,
          active: false,
          placeholder: null,
          candidate: null,
          candidateTimer: null,
          originalStyle: {
            position: card.style.position,
            left: card.style.left,
            top: card.style.top,
            width: card.style.width,
            height: card.style.height,
            margin: card.style.margin,
            transform: card.style.transform,
            transition: card.style.transition,
            zIndex: card.style.zIndex,
            pointerEvents: card.style.pointerEvents,
            touchAction: originalTouchAction,
            order: card.style.order
          }
        };
      }
    }

    function handlePointerUp() {
      cardResize?.element.classList.remove("is-card-resizing");
      cardResize = null;
      tableResize = null;
      finishCardDrag();
      clearHoverState();
    }

    function handleDoubleClick(event: MouseEvent) {
      if (!(event.target instanceof HTMLElement)) return;
      const target = event.target;
      const tableEdge = getTableEdge(target, event.clientX, event.clientY);
      if (tableEdge?.kind === "column") {
        tableEdge.table.querySelectorAll<HTMLElement>("th").forEach((cell) => {
          cell.style.width = "";
          cell.style.minWidth = "";
          cell.style.maxWidth = "";
        });
        const originalWidth = tableEdge.table.dataset.originalInlineWidth;
        const originalMinWidth = tableEdge.table.dataset.originalInlineMinWidth;
        tableEdge.table.style.width = originalWidth && originalWidth !== "__empty__" ? originalWidth : "";
        tableEdge.table.style.minWidth = originalMinWidth && originalMinWidth !== "__empty__" ? originalMinWidth : "";
        return;
      }
      if (tableEdge?.kind === "row") {
        tableEdge.row.style.height = "";
        return;
      }
      const card = target.closest<HTMLElement>(CARD_SELECTOR);
      if (!card) return;
      const edge = getCardEdge(card, event.clientX, event.clientY);
      if (!edge.horizontal && !edge.vertical) return;
      card.style.width = "";
      card.style.height = "";
      card.style.gridColumn = "";
      card.classList.remove("is-user-sized");
    }

    function handleMouseOver(event: MouseEvent) {
      if (!(event.target instanceof HTMLElement)) return;
      const cell = event.target.closest<HTMLTableCellElement>(".resizable-table td, .resizable-table th");
      if (!cell || cell.hasAttribute("title") || cell.querySelector("input, select, textarea")) return;
      if (cell.scrollWidth > cell.clientWidth + 2 || cell.scrollHeight > cell.clientHeight + 2) {
        const label = cell.innerText.replace(/\s+/g, " ").trim();
        if (label) cell.title = label;
      }
    }

    function handleDocumentPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (activeColumnMenu?.contains(event.target) || activeColumnTrigger?.contains(event.target)) return;
      closeColumnMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeColumnMenu();
    }

    function handleViewportChange() {
      closeColumnMenu();
    }

    workspace.addEventListener("pointermove", handlePointerMove);
    workspace.addEventListener("pointerdown", handlePointerDown);
    workspace.addEventListener("dblclick", handleDoubleClick);
    workspace.addEventListener("mouseover", handleMouseOver);
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      mutationObserver.disconnect();
      cardObserver.disconnect();
      if (workspaceRefreshFrame) window.cancelAnimationFrame(workspaceRefreshFrame);
      if (cardSettleTimer) window.clearTimeout(cardSettleTimer);
      if (drag?.candidateTimer) window.clearTimeout(drag.candidateTimer);
      if (drag?.placeholder) drag.placeholder.remove();
      if (drag) {
        restoreDraggedCardStyle(drag);
        drag.element.classList.remove("is-card-dragging", "is-card-settling");
      }
      setCardDragLock(false);
      tablesPendingVisibility.clear();
      closeColumnMenu();
      workspace.removeEventListener("pointermove", handlePointerMove);
      workspace.removeEventListener("pointerdown", handlePointerDown);
      workspace.removeEventListener("dblclick", handleDoubleClick);
      workspace.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      root.style.cursor = "";
    };
  }, []);

  return null;
}
