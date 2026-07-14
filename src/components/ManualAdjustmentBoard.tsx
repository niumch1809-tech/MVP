"use client";

import { useMemo, useState } from "react";
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
  const [categorySort, setCategorySort] = useState<"count" | "name">("count");
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
      .slice(0, 160);
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
    onUpdateRows(rowIds, { manualCategory: category, manualMatchKey: "", manualName: "" });
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
    <section className="reveal-in app-surface rounded-[22px] p-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(680px,1.05fr)] xl:items-end">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink">手工校准台</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              手动调整分类、数量、单价和匹配关系；人工字段会优先参与后续报价对比、总成本和导出。
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_180px_150px] xl:grid-cols-[minmax(0,1fr)_180px_180px_150px]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 rounded-[14px] border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
              placeholder="搜索物料/规格/供应商"
            />
            <select
              value={supplier}
              onChange={(event) => setSupplier(event.target.value)}
              className="h-10 rounded-[14px] border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
            >
              <option value="">全部供应商</option>
              {suppliers.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="h-10 rounded-[14px] border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
            >
              <option value="">全部品类</option>
              {allCategories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <button
              type="button"
              onClick={() => clearManual()}
              disabled={selectedIds.length === 0}
              className="motion-lift h-10 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              清除所选人工规则
            </button>
          </div>
      </div>

      <div className="mt-4 grid min-h-0 gap-3">
        <CategoryManager
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

        <MaterialPool
          rows={visibleRows}
          selectedIds={selectedIds}
          selectedRows={selectedRows}
          categories={allCategories}
          onToggleSelected={toggleSelected}
          onUpdateSingleRow={updateSingleRow}
        />
      </div>
    </section>
  );
}

function MaterialPool({
  rows,
  selectedIds,
  selectedRows,
  categories,
  onToggleSelected,
  onUpdateSingleRow
}: {
  rows: CanonicalBomRow[];
  selectedIds: string[];
  selectedRows: CanonicalBomRow[];
  categories: string[];
  onToggleSelected: (rowId: string) => void;
  onUpdateSingleRow: (row: CanonicalBomRow, field: EditableField, value: string) => void;
}) {
  return (
    <section className="app-surface min-w-0 rounded-[24px] p-3">
      <PanelHeader title="物料池" meta={`显示 ${rows.length} 行 / 已选 ${selectedIds.length} 行`} />
      {selectedRows.length > 0 && (
        <div className="mt-3 rounded-[16px] bg-slate-950 px-3 py-2 text-xs text-white">
          已选：{selectedRows.map((row) => `${row.supplierName}-${row.materialName}`).slice(0, 4).join(" / ")}
          {selectedRows.length > 4 ? " ..." : ""}
        </div>
      )}
      <div className="mt-3 max-h-[calc(100dvh-430px)] min-h-[360px] overflow-auto rounded-[18px] border border-slate-200 bg-white">
        <table className="min-w-[780px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 shadow-sm">
            <tr>
              <th className="w-12 px-2 py-2 font-semibold">选</th>
              <th className="px-2 py-2 font-semibold">供应商</th>
              <th className="px-2 py-2 font-semibold">物料/规格</th>
              <th className="px-2 py-2 font-semibold">品类</th>
              <th className="px-2 py-2 text-right font-semibold">数量</th>
              <th className="px-2 py-2 text-right font-semibold">单价</th>
              <th className="px-2 py-2 text-right font-semibold">金额</th>
              <th className="px-2 py-2 font-semibold">匹配</th>
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
                  className={`border-t border-slate-100 ${selected ? "bg-blue-50/80" : "bg-white hover:bg-slate-50"}`}
                >
                  <td className="px-2 py-2">
                    <input type="checkbox" checked={selected} onChange={() => onToggleSelected(row.id)} />
                  </td>
                  <td className="max-w-28 whitespace-nowrap px-2 py-2 font-semibold text-slate-700">
                    <span className="block truncate">{row.supplierName}</span>
                  </td>
                  <td className="min-w-56 px-2 py-2">
                    <input
                      value={row.manualName || row.materialName}
                      onChange={(event) => onUpdateSingleRow(row, "materialName", event.target.value)}
                      className="w-full rounded-[10px] border border-transparent bg-transparent px-2 py-1 font-semibold text-ink outline-none focus:border-slate-300 focus:bg-white"
                    />
                    <p className="px-2 text-[11px] text-slate-400">{row.spec || row.sourceFileName}</p>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={getRowCategory(row)}
                      onChange={(event) => onUpdateSingleRow(row, "category", event.target.value)}
                      className="w-32 rounded-[10px] border border-slate-200 bg-white px-2 py-1 text-slate-700 outline-none"
                    >
                      {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </td>
                  <NumberCell value={row.quantity} onChange={(value) => onUpdateSingleRow(row, "quantity", value)} />
                  <NumberCell value={row.unitPrice} onChange={(value) => onUpdateSingleRow(row, "unitPrice", value)} />
                  <NumberCell value={row.amount} onChange={(value) => onUpdateSingleRow(row, "amount", value)} />
                  <td className="max-w-32 whitespace-nowrap px-2 py-2 text-slate-500">
                    <span className="block truncate">{row.manualName ? row.manualName : "-"}</span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">
                  暂无可校准物料，请先上传供应商 BOM。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CategoryManager({
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
  sortMode: "count" | "name";
  manualCategorySet: Set<string>;
  newCategory: string;
  onNewCategoryChange: (value: string) => void;
  onCreateCategory: () => void;
  onSelectCategory: (category: string) => void;
  onSortModeChange: (value: "count" | "name") => void;
  onDeleteCategory: (category: string) => void;
  onDropRows: (event: DragEvent, category: string) => void;
}) {
  const categoryItems = useMemo(() => {
    return allCategories
      .map((category) => ({ category, count: rows.filter((row) => getRowCategory(row) === category).length }))
      .sort((a, b) => {
        if (sortMode === "name") return a.category.localeCompare(b.category, "zh-CN");
        return b.count - a.count || a.category.localeCompare(b.category, "zh-CN");
      });
  }, [allCategories, rows, sortMode]);

  return (
    <aside className="rounded-[20px] border border-slate-200 bg-white/70 p-3">
      <PanelHeader title="品类池" meta={`${allCategories.length} 个品类`} />
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <input
          value={newCategory}
          onChange={(event) => onNewCategoryChange(event.target.value)}
          className="min-w-0 rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
          placeholder="创建新品类"
        />
        <button type="button" onClick={onCreateCategory} className="rounded-[14px] bg-slate-950 px-4 text-sm font-semibold text-white">
          新建
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onSortModeChange("count")}
          className={`rounded-[14px] px-3 py-2 text-xs font-semibold ${sortMode === "count" ? "bg-slate-950 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
        >
          按数量
        </button>
        <button
          type="button"
          onClick={() => onSortModeChange("name")}
          className={`rounded-[14px] px-3 py-2 text-xs font-semibold ${sortMode === "name" ? "bg-slate-950 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
        >
          按名称
        </button>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-slate-500">点击品类筛选物料；拖动物料到品类即可归类。</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
        {categoryItems.map(({ category, count }) => {
          const selected = selectedCategory === category;
          const canDelete = manualCategorySet.has(category);
          return (
            <div
              key={category}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDropRows(event, category)}
              className={`group relative aspect-square min-h-[82px] rounded-[18px] border p-3 transition duration-200 active:scale-[0.98] ${
                selected ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-950/15" : "border-slate-200 bg-slate-50 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-white hover:shadow-md hover:shadow-slate-200/70"
              }`}
            >
              <div className="flex h-full flex-col justify-between gap-2">
                <button type="button" onClick={() => onSelectCategory(selected ? "" : category)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-semibold">{category}</span>
                  <span className={selected ? "text-[11px] text-white/60" : "text-[11px] text-slate-500"}>{count} 行物料</span>
                </button>
                <div className="absolute right-2 top-2 flex shrink-0 items-center gap-1">
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => onDeleteCategory(category)}
                      className={`grid h-6 w-6 place-items-center rounded-[12px] text-sm font-semibold ${
                        selected ? "text-white/60 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-white hover:text-danger"
                      }`}
                      aria-label={`删除品类 ${category}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
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
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <span className="rounded-full bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">{meta}</span>
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

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export type { ManualGroup };
