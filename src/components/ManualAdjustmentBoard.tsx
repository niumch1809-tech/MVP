"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { CanonicalBomRow } from "@/types/bom";
import {
  getComparisonObjectLabel,
  inferAlignedMaterialName,
  STANDARD_CATEGORIES,
  normalizeCostCategory
} from "@/lib/bom/cost-comparison";

type ManualGroup = {
  id: string;
  name: string;
  category: string;
};

type Props = {
  rows: CanonicalBomRow[];
  categories: string[];
  onCreateCategory: (category: string) => void;
  onDeleteCategory: (category: string) => void;
  onUpdateRows: (rowIds: string[], patch: Partial<CanonicalBomRow>) => void;
};

type EditableField = "materialName" | "category" | "quantity" | "unitPrice" | "amount";
type CategorySort = "count" | "name";

type AlignmentGroup = {
  id: string;
  baseKey: string;
  category: string;
  rows: CanonicalBomRow[];
  amounts: Record<string, number>;
  coverage: number;
  diffAmount: number;
};

const ALIGNMENT_EXCLUDED_CATEGORIES = new Set([
  "材料成本合计",
  "人工/管理/利润",
  "人工",
  "出厂价"
]);

export function ManualAdjustmentBoard({
  rows,
  categories,
  onCreateCategory,
  onDeleteCategory,
  onUpdateRows
}: Props) {
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categorySort, setCategorySort] = useState<CategorySort>("count");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");

  const suppliers = useMemo(() => unique(rows.map(getComparisonObjectLabel).filter(Boolean)), [rows]);
  const supplierCounts = useMemo(
    () =>
      new Map(
        suppliers.map((item) => [
          item,
          rows.filter((row) => getComparisonObjectLabel(row) === item).length
        ])
      ),
    [rows, suppliers]
  );
  const allCategories = useMemo(
    () => unique([...STANDARD_CATEGORIES, ...categories, ...rows.map(getRowCategory)].filter(Boolean)),
    [categories, rows]
  );
  const manualCategorySet = useMemo(
    () => new Set([...categories, ...rows.map((row) => row.manualCategory?.trim()).filter((value): value is string => Boolean(value))]),
    [categories, rows]
  );
  useEffect(() => {
    if (suppliers.length === 0) {
      if (supplier) setSupplier("");
      return;
    }
    if (!supplier || !suppliers.includes(supplier)) {
      setSupplier(suppliers[0]);
    }
  }, [supplier, suppliers]);

  const visibleRows = useMemo(() => {
    const text = query.trim().toLowerCase();
    return rows
      .filter((row) => !supplier || getComparisonObjectLabel(row) === supplier)
      .filter((row) => !categoryFilter || getRowCategory(row) === categoryFilter)
      .filter((row) => {
        if (!text) return true;
        return `${row.materialName} ${row.normalizedName} ${row.manualName ?? ""} ${row.spec} ${row.supplierName} ${row.quoteName ?? ""}`
          .toLowerCase()
          .includes(text);
      })
      .slice(0, 220);
  }, [categoryFilter, query, rows, supplier]);

  const selectedRows = rows.filter((row) => selectedIds.includes(row.id));

  function toggleSelected(rowId: string) {
    setSelectedIds((current) => current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]);
  }

  function selectSupplier(nextSupplier: string) {
    setSupplier(nextSupplier);
    setCategoryFilter("");
    setQuery("");
    setSelectedIds([]);
  }

  function createCategory() {
    const category = newCategory.trim();
    if (!category) return;
    onCreateCategory(category);
    setCategoryFilter(category);
    setNewCategory("");
  }

  function deleteCategory(category: string) {
    if (!category) return;
    onDeleteCategory(category);
    setCategoryFilter("");
    setSelectedIds([]);
  }

  function applyCategory(category: string, rowIds = selectedIds) {
    if (rowIds.length === 0) return;
    onUpdateRows(rowIds, {
      manualCategory: category
    });
    setSelectedIds([]);
  }

  function clearManual(rowIds = selectedIds) {
    if (rowIds.length === 0) return;
    onUpdateRows(rowIds, { manualCategory: "", manualMatchKey: "", manualName: "" });
    setSelectedIds([]);
  }

  function handleDrop(event: DragEvent, action: (rowIds: string[]) => void) {
    event.preventDefault();
    const rowIds = parseDraggedIds(event);
    action(rowIds.length > 0 ? rowIds : selectedIds);
  }

  function updateSingleRow(row: CanonicalBomRow, field: EditableField, value: string) {
    if (field === "quantity" || field === "unitPrice" || field === "amount") {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return;
      const patch: Partial<CanonicalBomRow> = { [field]: numeric };
      if (field === "quantity" || field === "unitPrice") {
        const quantity = field === "quantity" ? numeric : row.quantity;
        const unitPrice = field === "unitPrice" ? numeric : row.unitPrice;
        patch.amount = quantity * unitPrice;
        patch.totalPrice = patch.amount;
        patch.isAmountCalculated = true;
      }
      onUpdateRows([row.id], patch);
      return;
    }
    if (field === "category") {
      onUpdateRows([row.id], { manualCategory: value });
      return;
    }
    onUpdateRows([row.id], { materialName: value, manualName: value });
  }

  return (
    <section className="reveal-in app-surface rounded-[20px] p-4">
      <div className="min-w-0">
        <h3 className="type-panel-title text-ink">整理物料</h3>
        <p className="type-caption mt-1 max-w-3xl text-slate-500">
          按报价逐份检查品类、名称和金额。整理好后，到“对齐物料”把不同叫法放到同一条对比行。
        </p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_140px]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="field-shell h-10 rounded-[12px] px-3 text-[13px] outline-none"
          placeholder="搜索物料或规格"
        />
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="field-shell h-10 rounded-[12px] px-3 text-[13px] outline-none"
        >
          <option value="">全部品类</option>
          {allCategories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <button
          type="button"
          onClick={() => clearManual()}
          disabled={selectedIds.length === 0}
          className="button-secondary motion-lift h-10 rounded-[14px] px-4 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          恢复所选
        </button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] xl:items-start">
        <CalibrationSheet
          rows={visibleRows}
          selectedIds={selectedIds}
          selectedRows={selectedRows}
          suppliers={suppliers}
          supplierCounts={supplierCounts}
          activeSupplier={supplier}
          categories={allCategories}
          onSupplierChange={selectSupplier}
          onToggleSelected={toggleSelected}
          onUpdateSingleRow={updateSingleRow}
        />

        <CategoryPool
          rows={rows}
          allCategories={allCategories}
          selectedCategory={categoryFilter}
          sortMode={categorySort}
          manualCategorySet={manualCategorySet}
          newCategory={newCategory}
          onNewCategoryChange={setNewCategory}
          onCreateCategory={createCategory}
          onSelectCategory={setCategoryFilter}
          onSortModeChange={setCategorySort}
          onDeleteCategory={deleteCategory}
          onDropRows={(event, category) => handleDrop(event, (rowIds) => applyCategory(category, rowIds))}
        />
      </div>
    </section>
  );
}

export function MaterialAlignmentBoard({
  rows,
  categories,
  onUpdateRows
}: Pick<Props, "rows" | "categories" | "onUpdateRows">) {
  const allSuppliers = useMemo(
    () => unique(rows.map(getComparisonObjectLabel).filter(Boolean)),
    [rows]
  );
  const allCategories = useMemo(
    () =>
      unique([...categories, ...rows.map(getRowCategory)].filter(Boolean)).filter(
        (category) =>
          !ALIGNMENT_EXCLUDED_CATEGORIES.has(category) &&
          rows.some((row) => row.amount > 0 && getRowCategory(row) === category)
      ),
    [categories, rows]
  );
  const [activeCategory, setActiveCategory] = useState("");
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);

  useEffect(() => {
    if (allCategories.length === 0) {
      setActiveCategory("");
      return;
    }
    setActiveCategory((current) =>
      current && allCategories.includes(current) ? current : allCategories[0]
    );
  }, [allCategories]);

  useEffect(() => {
    setSelectedSuppliers((current) => {
      const retained = current.filter((supplier) => allSuppliers.includes(supplier));
      if (retained.length >= 2) return retained.slice(0, 4);
      return allSuppliers.slice(0, Math.min(3, allSuppliers.length));
    });
  }, [allSuppliers]);

  function toggleSupplier(supplier: string) {
    setSelectedSuppliers((current) => {
      if (current.includes(supplier)) {
        return current.length <= 2
          ? current
          : current.filter((item) => item !== supplier);
      }
      return current.length >= 4 ? current : [...current, supplier];
    });
  }

  return (
    <section className="reveal-in app-surface min-w-0 overflow-hidden rounded-[20px] p-3">
      <div className="flex flex-col gap-3 border-b border-slate-200/80 px-1 pb-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <h3 className="type-panel-title text-ink">对齐物料</h3>
          <p className="type-caption mt-1 text-slate-500">
            同品类物料横向排开。抓住物料左侧手柄，拖到另一份报价的对应行。
          </p>
        </div>
        <div className="grid min-w-0 gap-2 md:grid-cols-[200px_minmax(0,1fr)] xl:w-[min(760px,62vw)]">
          <label className="min-w-0">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500">品类</span>
            <select
              value={activeCategory}
              onChange={(event) => setActiveCategory(event.target.value)}
              className="field-shell h-9 w-full rounded-[11px] px-3 text-[12px] font-semibold text-slate-800 outline-none"
            >
              {allCategories.map((category) => {
                const count = rows.filter(
                  (row) => row.amount > 0 && getRowCategory(row) === category
                ).length;
                return <option key={category} value={category}>{category} · {count} 项</option>;
              })}
            </select>
          </label>
          <div className="min-w-0">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-500">显示报价</span>
              <span className="text-[10px] text-slate-400">选择 2–4 份</span>
            </div>
            <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5">
              {allSuppliers.map((supplier) => {
                const active = selectedSuppliers.includes(supplier);
                const cannotRemove = active && selectedSuppliers.length <= 2;
                const cannotAdd = !active && selectedSuppliers.length >= 4;
                return (
                  <button
                    key={supplier}
                    type="button"
                    onClick={() => toggleSupplier(supplier)}
                    disabled={cannotRemove || cannotAdd}
                    title={supplier}
                    className={`h-9 max-w-[180px] shrink-0 truncate rounded-[11px] border px-3 text-[11px] font-semibold transition ${
                      active
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-400"
                    } disabled:cursor-not-allowed disabled:opacity-55`}
                  >
                    {supplier}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <MaterialAlignmentWorkspace
        rows={rows}
        suppliers={selectedSuppliers}
        activeCategory={activeCategory}
        onUpdateRows={onUpdateRows}
      />
    </section>
  );
}

function MaterialAlignmentWorkspace({
  rows,
  suppliers,
  activeCategory,
  onUpdateRows
}: {
  rows: CanonicalBomRow[];
  suppliers: string[];
  activeCategory: string;
  onUpdateRows: (rowIds: string[], patch: Partial<CanonicalBomRow>) => void;
}) {
  const [draggedRowIds, setDraggedRowIds] = useState<string[]>([]);
  const [dropTargetId, setDropTargetId] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [expandedCellKey, setExpandedCellKey] = useState("");
  const [editingGroupId, setEditingGroupId] = useState("");
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const categoryRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.amount > 0 &&
          row.materialName.trim() &&
          getRowCategory(row) === activeCategory &&
          suppliers.includes(getComparisonObjectLabel(row))
      ),
    [activeCategory, rows, suppliers]
  );
  const groups = useMemo(
    () => buildAlignmentGroups(categoryRows, suppliers),
    [categoryRows, suppliers]
  );
  const alignedCount = groups.filter((group) => group.coverage > 1).length;
  const pendingCount = groups.length - alignedCount;
  const selectedSourceRows = categoryRows.filter((row) =>
    selectedSourceIds.includes(row.id)
  );
  const selectedSourceLabel = getGroupedMaterialLabel(selectedSourceRows);

  useEffect(() => {
    const validIds = selectedSourceIds.filter((id) =>
      categoryRows.some((row) => row.id === id)
    );
    if (validIds.length !== selectedSourceIds.length) {
      setSelectedSourceIds(validIds);
    }
  }, [categoryRows, selectedSourceIds]);

  function startDragging(event: DragEvent, sourceRows: CanonicalBomRow[]) {
    const ids = sourceRows.map((row) => row.id);
    const totalAmount = sourceRows.reduce((sum, row) => sum + row.amount, 0);
    setDraggedRowIds(ids);
    event.dataTransfer.setData("application/x-bom-row-ids", JSON.stringify(ids));
    event.dataTransfer.effectAllowed = "move";
    const ghost = document.createElement("div");
    ghost.textContent = `${getGroupedMaterialLabel(sourceRows)} · ¥${formatNumber(totalAmount)}`;
    ghost.style.cssText = [
      "position:fixed",
      "left:-9999px",
      "top:-9999px",
      "max-width:240px",
      "padding:8px 12px",
      "border:1px solid rgba(125,211,252,.75)",
      "border-radius:10px",
      "background:rgba(255,255,255,.92)",
      "box-shadow:0 10px 28px rgba(14,165,233,.18)",
      "color:#0f172a",
      "font:600 12px Microsoft YaHei,sans-serif",
      "white-space:nowrap",
      "overflow:hidden",
      "text-overflow:ellipsis"
    ].join(";");
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 18, 18);
    window.setTimeout(() => ghost.remove(), 0);
  }

  function dropIntoGroup(event: DragEvent, target: AlignmentGroup) {
    event.preventDefault();
    const sourceIds = parseDraggedIds(event);
    setDraggedRowIds([]);
    setDropTargetId("");
    alignRowsToGroup(sourceIds, target);
  }

  function alignRowsToGroup(sourceIds: string[], target: AlignmentGroup) {
    const validSourceIds = sourceIds.filter((id) =>
      categoryRows.some((row) => row.id === id)
    );
    if (validSourceIds.length === 0) return;
    if (validSourceIds.every((id) => target.rows.some((row) => row.id === id))) return;

    const matchKey =
      target.rows.find((row) => row.manualMatchKey?.trim())?.manualMatchKey ||
      buildManualMatchKey(activeCategory);
    const alignedRows = unique([...target.rows.map((row) => row.id), ...validSourceIds])
      .map((id) => categoryRows.find((row) => row.id === id))
      .filter((row): row is CanonicalBomRow => Boolean(row));
    const alignedName = inferAlignedMaterialName(alignedRows);
    onUpdateRows(
      alignedRows.map((row) => row.id),
      { manualMatchKey: matchKey, manualName: alignedName }
    );
    setSelectedSourceIds([]);
  }

  function separateRow(row: CanonicalBomRow) {
    onUpdateRows(
      [row.id],
      { manualMatchKey: `manual:split:${row.id}:${Date.now()}` }
    );
    if (selectedSourceIds.includes(row.id)) setSelectedSourceIds([]);
  }

  function saveGroupName(group: AlignmentGroup) {
    const name = groupNameDraft.trim();
    if (name) {
      onUpdateRows(group.rows.map((row) => row.id), { manualName: name });
    }
    setEditingGroupId("");
    setGroupNameDraft("");
  }

  function handleScrollAreaDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const area = scrollAreaRef.current;
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const edgeZone = Math.min(96, rect.height * 0.2);
    const distanceFromTop = event.clientY - rect.top;
    const distanceFromBottom = rect.bottom - event.clientY;
    if (distanceFromTop < edgeZone) {
      const strength = 1 - Math.max(0, distanceFromTop) / edgeZone;
      area.scrollTop -= Math.max(12, Math.round(42 * strength));
    } else if (distanceFromBottom < edgeZone) {
      const strength = 1 - Math.max(0, distanceFromBottom) / edgeZone;
      area.scrollTop += Math.max(12, Math.round(42 * strength));
    }
  }

  return (
    <section className="mt-3 overflow-hidden rounded-[15px] border border-slate-200/80 bg-white/72">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 px-3 py-2.5">
        <h4 className="text-[13px] font-semibold text-ink">{activeCategory || "物料"}对比</h4>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          {alignedCount} 项已对齐
        </span>
        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            {pendingCount} 项待匹配
          </span>
        )}
        <span className="ml-auto hidden text-[10px] text-slate-400 sm:inline">
          可拖动，也可先选中物料后点击目标行
        </span>
      </div>

      {selectedSourceRows.length > 0 && (
        <div className="flex items-center gap-2 border-b border-sky-100 bg-sky-50/90 px-3 py-2 text-xs">
          <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-sky-500 px-1.5 font-bold text-white">
            {selectedSourceRows.length}
          </span>
          <p className="min-w-0 flex-1 truncate text-sky-950">
            已选择 <strong>{selectedSourceLabel}</strong>，现在可以自由滚动，再点击目标行的“合并到这里”。
          </p>
          <button
            type="button"
            onClick={() => setSelectedSourceIds([])}
            className="shrink-0 rounded-[8px] px-2 py-1 font-semibold text-sky-700 hover:bg-white"
          >
            取消
          </button>
        </div>
      )}

      {suppliers.length < 2 ? (
        <div className="px-4 py-14 text-center">
          <p className="text-sm font-semibold text-slate-700">至少导入两份报价后才能对齐物料</p>
          <p className="mt-1 text-xs text-slate-500">同一供应商的不同产品或型号，也会作为不同报价列显示。</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-slate-500">
          当前品类没有可对齐的物料。
        </div>
      ) : (
        <div
          ref={scrollAreaRef}
          onDragOver={handleScrollAreaDragOver}
          className="max-h-[calc(100dvh-250px)] overflow-auto scroll-smooth"
        >
          <table className="type-table w-full table-fixed text-left">
            <thead className="sticky top-0 z-20 bg-slate-50/95 text-slate-500 shadow-sm backdrop-blur">
              <tr>
                <th className="sticky left-0 z-30 w-28 bg-slate-50 px-2.5 py-2 font-semibold">对比项</th>
                {suppliers.map((supplier) => (
                  <th key={supplier} className="px-2 py-2 font-semibold">
                    <span className="block truncate" title={supplier}>{supplier}</span>
                  </th>
                ))}
                <th className="w-24 px-2.5 py-2 text-right font-semibold">金额差</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group, groupIndex) => {
                const isDropTarget = dropTargetId === group.id;
                return (
                  <tr
                    key={group.id}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropTargetId(group.id);
                    }}
                    onDragLeave={() => setDropTargetId((current) => current === group.id ? "" : current)}
                    onDrop={(event) => dropIntoGroup(event, group)}
                    className={`border-t border-slate-100 align-top transition ${
                      isDropTarget ? "bg-sky-50/90 shadow-[inset_0_0_0_2px_rgba(56,189,248,0.34)]" : "bg-white/80"
                    }`}
                  >
                    <td className={`sticky left-0 z-10 px-2.5 py-2 ${isDropTarget ? "bg-sky-50" : "bg-white"}`}>
                      {editingGroupId === group.id ? (
                        <input
                          autoFocus
                          value={groupNameDraft}
                          onChange={(event) => setGroupNameDraft(event.target.value)}
                          onBlur={() => saveGroupName(group)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") saveGroupName(group);
                            if (event.key === "Escape") {
                              setEditingGroupId("");
                              setGroupNameDraft("");
                            }
                          }}
                          className="h-7 w-full rounded-[7px] border border-sky-300 bg-white px-1.5 text-[11px] font-semibold text-slate-800 outline-none ring-2 ring-sky-100"
                          aria-label="修改对比项名称"
                        />
                      ) : (
                        <div className="group/name flex min-w-0 items-center gap-1">
                          <span
                            className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-800"
                            title={inferAlignedMaterialName(group.rows)}
                          >
                            {inferAlignedMaterialName(group.rows) || `${activeCategory} ${String(groupIndex + 1).padStart(2, "0")}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingGroupId(group.id);
                              setGroupNameDraft(inferAlignedMaterialName(group.rows));
                            }}
                            className="shrink-0 rounded-[6px] px-1 py-0.5 text-[9px] font-semibold text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 group-hover/name:opacity-100 focus:opacity-100"
                          >
                            改名
                          </button>
                        </div>
                      )}
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        group.coverage > 1
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}>
                        {group.coverage > 1 ? `${group.coverage} 份已对齐` : "拖到对应行"}
                      </span>
                      {selectedSourceRows.length > 0 &&
                        !selectedSourceRows.every((sourceRow) =>
                          group.rows.some((row) => row.id === sourceRow.id)
                        ) && (
                        <button
                          type="button"
                          onClick={() => alignRowsToGroup(selectedSourceIds, group)}
                          className="mt-1.5 block w-full rounded-[8px] bg-sky-500 px-1.5 py-1 text-[9px] font-semibold text-white shadow-sm hover:bg-sky-600"
                        >
                          合并到这里
                        </button>
                      )}
                    </td>
                    {suppliers.map((supplier) => {
                      const supplierRows = group.rows.filter(
                        (row) => getComparisonObjectLabel(row) === supplier
                      );
                      const supplierRowIds = supplierRows.map((row) => row.id);
                      const cellKey = `${group.id}:${supplier}`;
                      const isExpanded = expandedCellKey === cellKey;
                      const isDragging = supplierRowIds.some((id) =>
                        draggedRowIds.includes(id)
                      );
                      const isSelected =
                        supplierRowIds.length > 0 &&
                        sameIdSet(supplierRowIds, selectedSourceIds);
                      const totalQuantity = supplierRows.reduce(
                        (sum, row) => sum + row.quantity,
                        0
                      );
                      const totalAmount = supplierRows.reduce(
                        (sum, row) => sum + row.amount,
                        0
                      );
                      const fullDescription = supplierRows
                        .map((row) =>
                          [row.materialName, row.spec].filter(Boolean).join("：")
                        )
                        .join("；");
                      return (
                        <td key={supplier} className="px-1.5 py-1.5">
                          <div className="grid min-h-[68px] gap-1.5">
                            {supplierRows.length > 0 && (
                              <>
                                <article
                                  onClick={() =>
                                    setSelectedSourceIds((current) =>
                                      sameIdSet(current, supplierRowIds)
                                        ? []
                                        : supplierRowIds
                                    )
                                  }
                                  className={`group/material h-[64px] select-none overflow-hidden rounded-[10px] border bg-white px-2 py-2 shadow-sm transition ${
                                    isDragging
                                      ? "scale-[0.97] border-sky-300 opacity-55 shadow-[0_0_0_4px_rgba(125,211,252,0.15)]"
                                      : isSelected
                                        ? "border-sky-400 bg-sky-50/70 shadow-[0_0_0_3px_rgba(125,211,252,0.14)]"
                                        : "border-slate-200 hover:border-sky-300 hover:shadow-md"
                                  }`}
                                  title={fullDescription}
                                >
                                  <div className="flex items-start gap-1.5">
                                    <span
                                      draggable
                                      onDragStart={(event) =>
                                        startDragging(event, supplierRows)
                                      }
                                      onClick={(event) => event.stopPropagation()}
                                      onDragEnd={() => {
                                        setDraggedRowIds([]);
                                        setDropTargetId("");
                                      }}
                                      className="mt-0.5 grid h-7 w-5 shrink-0 cursor-grab place-items-center rounded-[7px] text-[13px] text-slate-300 transition hover:bg-sky-50 hover:text-sky-500 active:cursor-grabbing"
                                      title="抓住并拖动整组物料"
                                      aria-label={`拖动 ${getGroupedMaterialLabel(supplierRows)}`}
                                    >
                                      ⋮⋮
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex min-w-0 items-center gap-1.5">
                                        <p className="truncate text-[12px] font-semibold text-slate-900">
                                          {getGroupedMaterialLabel(supplierRows)}
                                        </p>
                                        {supplierRows.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setExpandedCellKey((current) =>
                                                current === cellKey ? "" : cellKey
                                              );
                                            }}
                                            className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 hover:bg-sky-100 hover:text-sky-700"
                                            aria-expanded={isExpanded}
                                          >
                                            {supplierRows.length} 项
                                          </button>
                                        )}
                                      </div>
                                      <p className="truncate text-[10px] text-slate-400">
                                        {supplierRows.length > 1
                                          ? "重复物料已合并，点击项数查看明细"
                                          : supplierRows[0].spec || "无规格"}
                                      </p>
                                    </div>
                                    {supplierRows.length === 1 && (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          separateRow(supplierRows[0]);
                                        }}
                                        className="ml-auto shrink-0 rounded-[7px] px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 group-hover/material:opacity-100 focus:opacity-100"
                                        title="从当前对比行拆开"
                                      >
                                        拆开
                                      </button>
                                    )}
                                  </div>
                                  <div className="mt-1.5 flex items-center justify-between pl-6 text-[10px] leading-none text-slate-500">
                                    <span>
                                      {supplierRows.length > 1
                                        ? `合计 ${formatNumber(totalQuantity)} 件`
                                        : `${formatNumber(totalQuantity)} ${supplierRows[0].unit || "件"}`}
                                    </span>
                                    <strong className="text-slate-800">
                                      ¥{formatNumber(totalAmount)}
                                    </strong>
                                  </div>
                                </article>
                                {isExpanded && (
                                  <div className="max-h-44 overflow-auto rounded-[10px] border border-slate-200 bg-slate-50/80 p-1.5">
                                    {supplierRows.map((row) => (
                                      <div
                                        key={row.id}
                                        className="flex items-center gap-2 rounded-[7px] px-2 py-1.5 text-[10px] hover:bg-white"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate font-semibold text-slate-700" title={row.materialName}>
                                            {row.materialName}
                                          </p>
                                          <p className="truncate text-slate-400" title={row.spec || "无规格"}>
                                            {row.spec || "无规格"} · ¥{formatNumber(row.amount)}
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => separateRow(row)}
                                          className="shrink-0 rounded-[6px] px-1.5 py-1 font-semibold text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                                        >
                                          拆开
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                            {supplierRows.length === 0 && (
                              <div className={`grid min-h-[64px] place-items-center rounded-[10px] border border-dashed text-[10px] ${
                                isDropTarget ? "border-sky-300 bg-sky-50/70 text-sky-600" : "border-slate-200 text-slate-400"
                              }`}>
                                拖入对应物料
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2.5 py-3 text-right">
                      {group.coverage > 1 ? (
                        <strong className="text-[12px] text-slate-800">¥{formatNumber(group.diffAmount)}</strong>
                      ) : (
                        <span className="text-xs text-slate-300">--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CalibrationSheet({
  rows,
  selectedIds,
  selectedRows,
  suppliers,
  supplierCounts,
  activeSupplier,
  categories,
  onSupplierChange,
  onToggleSelected,
  onUpdateSingleRow
}: {
  rows: CanonicalBomRow[];
  selectedIds: string[];
  selectedRows: CanonicalBomRow[];
  suppliers: string[];
  supplierCounts: Map<string, number>;
  activeSupplier: string;
  categories: string[];
  onSupplierChange: (supplier: string) => void;
  onToggleSelected: (rowId: string) => void;
  onUpdateSingleRow: (row: CanonicalBomRow, field: EditableField, value: string) => void;
}) {
  return (
    <section className="min-w-0 rounded-[18px] border border-slate-200/80 bg-white/68 p-3 shadow-[0_14px_42px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <PanelHeader title="供应商物料" meta={`${rows.length} 项 / 已选 ${selectedIds.length} 项`} />
          {selectedRows.length > 0 && (
            <div className="rounded-[12px] bg-slate-950 px-3 py-2 text-xs text-white">
              已选：{selectedRows.map((row) => `${row.supplierName}-${row.materialName}`).slice(0, 3).join(" / ")}
              {selectedRows.length > 3 ? " ..." : ""}
            </div>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {suppliers.map((item) => (
            <SupplierTab
              key={item}
              active={activeSupplier === item}
              label={item}
              count={supplierCounts.get(item) ?? 0}
              onClick={() => onSupplierChange(item)}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 max-h-[calc(100dvh-320px)] min-h-[560px] overflow-auto rounded-[16px] border border-slate-200/80 bg-white/86">
        <table className="type-table resizable-table min-w-[860px] text-left">
          <thead className="sticky top-0 z-20 bg-slate-50 text-slate-500 shadow-sm">
            <tr>
              <th className="sticky left-0 z-30 w-12 bg-slate-50 px-2 py-2 font-semibold">选</th>
              <th className="w-44 px-2 py-2 font-semibold">品类</th>
              <th className="min-w-72 px-2 py-2 font-semibold">物料</th>
              <th className="w-28 px-2 py-2 text-right font-semibold">数量</th>
              <th className="w-28 px-2 py-2 text-right font-semibold">单价</th>
              <th className="w-28 px-2 py-2 text-right font-semibold">成本</th>
              <th className="min-w-44 px-2 py-2 font-semibold">来源/规格</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = selectedIds.includes(row.id);
              return (
                <tr
                  key={row.id}
                  draggable
                  onDragStart={(event) => {
                    const ids = selected ? selectedIds : [row.id];
                    event.dataTransfer.setData("application/x-bom-row-ids", JSON.stringify(ids));
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  className={`border-t border-slate-100 ${selected ? "bg-emerald-50/90" : "bg-white/92 hover:bg-slate-50"}`}
                >
                  <td className={`sticky left-0 z-10 px-2 py-2 ${selected ? "bg-emerald-50" : "bg-white"}`}>
                    <input type="checkbox" checked={selected} onChange={() => onToggleSelected(row.id)} />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={getRowCategory(row)}
                      onChange={(event) => onUpdateSingleRow(row, "category", event.target.value)}
                      className="field-shell w-36 rounded-[10px] px-2 py-1 text-slate-700 outline-none"
                    >
                      {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.manualName || row.materialName}
                      onChange={(event) => onUpdateSingleRow(row, "materialName", event.target.value)}
                      className="w-full rounded-[10px] border border-transparent bg-transparent px-2 py-1 font-semibold text-ink outline-none focus:border-slate-300 focus:bg-white"
                    />
                    <p className="px-2 text-[11px] text-slate-400">{row.normalizedName || row.materialName}</p>
                  </td>
                  <NumberCell value={row.quantity} onChange={(value) => onUpdateSingleRow(row, "quantity", value)} />
                  <NumberCell value={row.unitPrice} onChange={(value) => onUpdateSingleRow(row, "unitPrice", value)} />
                  <NumberCell value={row.amount} onChange={(value) => onUpdateSingleRow(row, "amount", value)} />
                  <td className="max-w-44 px-2 py-2 text-slate-500">
                    <span className="block truncate">{row.spec || row.sourceFileName}</span>
                    <span className="block text-[11px] text-slate-400">第 {row.rowNumber} 行</span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm text-slate-500">
                  当前没有可整理的物料。请先上传 BOM，或换一个供应商和品类。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SupplierTab({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`motion-lift shrink-0 rounded-[16px] border px-4 py-2 text-left transition active:scale-[0.98] ${
        active ? "border-slate-950 bg-slate-950 text-white shadow-[0_12px_26px_rgba(15,23,42,0.16)]" : "border-slate-200 bg-white/82 text-slate-600 hover:border-slate-400"
      }`}
    >
      <span className="block max-w-32 truncate text-[13px] font-semibold">{label}</span>
      <span className={active ? "text-[11px] text-white/55" : "text-[11px] text-slate-400"}>{count} 行</span>
    </button>
  );
}

function CategoryPool({
  rows,
  allCategories,
  selectedCategory,
  sortMode,
  manualCategorySet,
  newCategory,
  onNewCategoryChange,
  onCreateCategory,
  onSelectCategory,
  onSortModeChange,
  onDeleteCategory,
  onDropRows
}: {
  rows: CanonicalBomRow[];
  allCategories: string[];
  selectedCategory: string;
  sortMode: CategorySort;
  manualCategorySet: Set<string>;
  newCategory: string;
  onNewCategoryChange: (value: string) => void;
  onCreateCategory: () => void;
  onSelectCategory: (category: string) => void;
  onSortModeChange: (value: CategorySort) => void;
  onDeleteCategory: (category: string) => void;
  onDropRows: (event: DragEvent, category: string) => void;
}) {
  const categoryItems = useMemo(() => {
    return allCategories
      .map((category) => ({ category, count: rows.filter((row) => getRowCategory(row) === category).length }))
      .filter((item) => item.count > 0 || manualCategorySet.has(item.category))
      .sort((a, b) => {
        if (sortMode === "name") return a.category.localeCompare(b.category, "zh-CN");
        return b.count - a.count || a.category.localeCompare(b.category, "zh-CN");
      });
  }, [allCategories, manualCategorySet, rows, sortMode]);

  return (
    <aside className="xl:sticky xl:top-4 rounded-[18px] border border-slate-200/80 bg-white/68 p-3 shadow-[0_14px_42px_rgba(15,23,42,0.05)]">
      <PanelHeader title="品类池" meta={`${categoryItems.length} 个有物料品类`} />
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <input
          value={newCategory}
          onChange={(event) => onNewCategoryChange(event.target.value)}
          className="field-shell min-w-0 rounded-[12px] px-3 py-2 text-[13px] outline-none"
          placeholder="创建新品类"
        />
        <button type="button" onClick={onCreateCategory} className="button-primary rounded-[12px] px-4 text-[13px] font-semibold">
          新增
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onSortModeChange("count")}
          className={`rounded-[12px] px-3 py-2 text-xs font-semibold ${sortMode === "count" ? "bg-slate-950 text-white" : "bg-white/82 text-slate-600 ring-1 ring-slate-200"}`}
        >
          按数量
        </button>
        <button
          type="button"
          onClick={() => onSortModeChange("name")}
          className={`rounded-[12px] px-3 py-2 text-xs font-semibold ${sortMode === "name" ? "bg-slate-950 text-white" : "bg-white/82 text-slate-600 ring-1 ring-slate-200"}`}
        >
          按名称
        </button>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-slate-500">只显示已有物料或手工创建的品类。拖入方块即可归类，点击方块可筛选左侧表格。</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {categoryItems.map(({ category, count }) => {
          const selected = selectedCategory === category;
          const canDelete = manualCategorySet.has(category);
          return (
            <div
              key={category}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDropRows(event, category)}
              className={`group relative aspect-square min-h-[92px] rounded-[18px] border p-3 transition duration-200 active:scale-[0.98] ${
                selected ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-950/15" : "border-slate-200 bg-slate-50/78 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-white hover:shadow-md hover:shadow-slate-200/70"
              }`}
            >
              <button type="button" onClick={() => onSelectCategory(selected ? "" : category)} className="flex h-full min-w-0 flex-col justify-between text-left">
                <span className="line-clamp-2 pr-5 text-[13px] font-semibold leading-5">{category}</span>
                <span className={selected ? "text-[11px] text-white/60" : "text-[11px] text-slate-500"}>{count} 行物料</span>
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDeleteCategory(category)}
                  className={`absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-[12px] text-sm font-semibold ${
                    selected ? "text-white/60 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-white hover:text-danger"
                  }`}
                  aria-label={`删除品类 ${category}`}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function NumberCell({ value, onChange }: { value: number; onChange: (value: string) => void }) {
  return (
    <td className="px-3 py-2 text-right">
      <input
        value={Number.isFinite(value) ? String(value) : "0"}
        onChange={(event) => onChange(event.target.value)}
        className="w-20 rounded-[10px] border border-transparent bg-transparent px-2 py-1 text-right text-slate-700 outline-none focus:border-slate-300 focus:bg-white"
      />
    </td>
  );
}

function PanelHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="type-panel-title text-ink">{title}</h3>
      <span className="type-caption rounded-[12px] bg-slate-50/82 px-2 py-1 font-semibold text-slate-500 ring-1 ring-slate-200">{meta}</span>
    </div>
  );
}

function getRowCategory(row: CanonicalBomRow): string {
  return row.manualCategory?.trim() || normalizeCostCategory(row.category, row.materialName);
}

function getGroupedMaterialLabel(rows: CanonicalBomRow[]): string {
  if (rows.length === 0) return "";
  const inferredName = inferAlignedMaterialName(rows);
  const names = unique(rows.map((row) => row.materialName.trim()).filter(Boolean));
  const firstName = inferredName || names[0] || "未命名物料";
  if (rows.length === 1) return firstName;
  return names.length === 1
    ? `${firstName} · ${rows.length} 项`
    : `${firstName} 等 ${rows.length} 项`;
}

function sameIdSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

function buildAlignmentGroups(rows: CanonicalBomRow[], suppliers: string[]): AlignmentGroup[] {
  const groupedRows = new Map<string, CanonicalBomRow[]>();

  rows.forEach((row) => {
    const key = getAlignmentKey(row);
    groupedRows.set(key, [...(groupedRows.get(key) ?? []), row]);
  });

  return Array.from(groupedRows.entries())
    .map(([id, groupRows]) => {
      const sortedRows = [...groupRows].sort(
        (a, b) =>
          suppliers.indexOf(getComparisonObjectLabel(a)) -
            suppliers.indexOf(getComparisonObjectLabel(b)) ||
          a.rowNumber - b.rowNumber
      );
      const amounts = Object.fromEntries(
        suppliers.map((supplier) => [
          supplier,
          sortedRows
            .filter((row) => getComparisonObjectLabel(row) === supplier)
            .reduce((sum, row) => sum + row.amount, 0)
        ])
      );
      const positiveAmounts = Object.values(amounts).filter((amount) => amount > 0);
      const coverage = positiveAmounts.length;
      return {
        id,
        baseKey: id,
        category: getRowCategory(sortedRows[0]),
        rows: sortedRows,
        amounts,
        coverage,
        diffAmount:
          coverage > 1
            ? Math.max(...positiveAmounts) - Math.min(...positiveAmounts)
            : 0
      };
    })
    .sort((a, b) => {
      const aAmount = Math.max(0, ...Object.values(a.amounts));
      const bAmount = Math.max(0, ...Object.values(b.amounts));
      return b.coverage - a.coverage || bAmount - aAmount;
    });
}

function getAlignmentKey(row: CanonicalBomRow): string {
  if (row.manualMatchKey?.trim()) return row.manualMatchKey.trim();
  const identity = (row.manualName || row.normalizedName || row.materialName)
    .split("|")[0]
    .toLowerCase()
    .replace(/[\s\-_/（）()【】[\]，,。.]/g, "");
  return `auto:${getRowCategory(row)}:${identity || row.id}`;
}

function parseDraggedIds(event: DragEvent): string[] {
  try {
    const raw = event.dataTransfer.getData("application/x-bom-row-ids");
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function buildManualMatchKey(category: string): string {
  return `manual:${category.trim() || "未命名品类"}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function formatNumber(value: number): string {
  return Number.isFinite(value)
    ? value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })
    : "0";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export type { ManualGroup };
