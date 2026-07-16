"use client";

import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { CanonicalBomRow } from "@/types/bom";
import { STANDARD_CATEGORIES, normalizeCostCategory } from "@/lib/bom/cost-comparison";

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

  const suppliers = useMemo(() => unique(rows.map((row) => row.supplierName).filter(Boolean)), [rows]);
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
      .filter((row) => !supplier || row.supplierName === supplier)
      .filter((row) => !categoryFilter || getRowCategory(row) === categoryFilter)
      .filter((row) => {
        if (!text) return true;
        return `${row.materialName} ${row.normalizedName} ${row.manualName ?? ""} ${row.spec} ${row.supplierName}`
          .toLowerCase()
          .includes(text);
      })
      .slice(0, 220);
  }, [categoryFilter, query, rows, supplier]);

  const selectedRows = rows.filter((row) => selectedIds.includes(row.id));

  function toggleSelected(rowId: string) {
    setSelectedIds((current) => current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]);
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
    const targetRows = rows.filter((row) => rowIds.includes(row.id));
    const supplierCount = new Set(targetRows.map((row) => row.supplierName).filter(Boolean)).size;
    const shouldCreateMatch = targetRows.length > 1 && supplierCount > 1;
    onUpdateRows(rowIds, {
      manualCategory: category,
      manualMatchKey: shouldCreateMatch ? buildManualMatchKey(category) : "",
      manualName: shouldCreateMatch ? category : ""
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
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(430px,0.42fr)] xl:items-end">
        <div className="min-w-0">
          <h3 className="type-panel-title text-ink">手工校准台</h3>
          <p className="type-caption mt-1 max-w-3xl text-slate-500">
            左侧按供应商检查物料，右侧固定显示全部品类；可拖动物料到品类池，也可在表格内直接下拉改品类。
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_140px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="field-shell h-10 rounded-[12px] px-3 text-[13px] outline-none"
            placeholder="搜索物料 / 规格 / 供应商"
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
            清除所选规则
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] xl:items-start">
        <CalibrationSheet
          rows={visibleRows}
          selectedIds={selectedIds}
          selectedRows={selectedRows}
          suppliers={suppliers}
          activeSupplier={supplier}
          categories={allCategories}
          onSupplierChange={setSupplier}
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

function CalibrationSheet({
  rows,
  selectedIds,
  selectedRows,
  suppliers,
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
          <PanelHeader title="供应商校准表" meta={`显示 ${rows.length} 行 / 已选 ${selectedIds.length} 行`} />
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
              count={rows.filter((row) => row.supplierName === item).length}
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
              <th className="min-w-72 px-2 py-2 font-semibold">对应物料</th>
              <th className="w-28 px-2 py-2 text-right font-semibold">个数</th>
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
                  当前筛选下没有可校准物料，请先上传供应商 BOM 或调整筛选条件。
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
      <p className="mt-3 text-[11px] leading-5 text-slate-500">固定显示全部品类。拖动物料到方块即可归类，点击方块可筛选左侧表格。</p>

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

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export type { ManualGroup };
