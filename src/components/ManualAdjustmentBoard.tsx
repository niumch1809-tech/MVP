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
  groups: ManualGroup[];
  onCreateCategory: (category: string) => void;
  onCreateGroup: (group: ManualGroup) => void;
  onDeleteGroup: (groupId: string) => void;
  onUpdateRows: (rowIds: string[], patch: Partial<CanonicalBomRow>) => void;
};

type EditableField = "materialName" | "category" | "quantity" | "unitPrice" | "amount";

export function ManualAdjustmentBoard({
  rows,
  categories,
  groups,
  onCreateCategory,
  onCreateGroup,
  onDeleteGroup,
  onUpdateRows
}: Props) {
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupCategory, setNewGroupCategory] = useState("");

  const suppliers = useMemo(() => unique(rows.map((row) => row.supplierName).filter(Boolean)), [rows]);
  const allCategories = useMemo(
    () => unique([...STANDARD_CATEGORIES, ...categories, ...rows.map(getRowCategory), ...groups.map((group) => group.category)].filter(Boolean)),
    [categories, groups, rows]
  );

  const visibleRows = useMemo(() => {
    const text = query.trim().toLowerCase();
    return rows
      .filter((row) => !supplier || row.supplierName === supplier)
      .filter((row) => {
        if (!text) return true;
        return `${row.materialName} ${row.normalizedName} ${row.manualName ?? ""} ${row.spec} ${row.supplierName}`
          .toLowerCase()
          .includes(text);
      })
      .slice(0, 160);
  }, [query, rows, supplier]);

  const selectedRows = rows.filter((row) => selectedIds.includes(row.id));

  function toggleSelected(rowId: string) {
    setSelectedIds((current) => current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]);
  }

  function createCategory() {
    const category = newCategory.trim();
    if (!category) return;
    onCreateCategory(category);
    setNewCategory("");
  }

  function createGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    const category = newGroupCategory || allCategories[0] || "其他";
    onCreateGroup({ id: `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`, name, category });
    setNewGroupName("");
    setNewGroupCategory("");
  }

  function applyCategory(category: string, rowIds = selectedIds) {
    if (rowIds.length === 0) return;
    onUpdateRows(rowIds, { manualCategory: category });
    setSelectedIds([]);
  }

  function applyGroup(group: ManualGroup, rowIds = selectedIds) {
    if (rowIds.length === 0) return;
    onUpdateRows(rowIds, { manualMatchKey: group.id, manualName: group.name, manualCategory: group.category });
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
    <section className="reveal-in grid gap-3">
      <div className="app-surface rounded-[24px] p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(520px,0.9fr)] xl:items-end">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink">手工校准台</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              手动调整分类、数量、单价和匹配关系；人工字段会优先参与后续报价对比、总成本和导出。
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_150px]">
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
      </div>

      <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <MaterialPool
          rows={visibleRows}
          selectedIds={selectedIds}
          selectedRows={selectedRows}
          onToggleSelected={toggleSelected}
          onUpdateSingleRow={updateSingleRow}
        />

        <aside className="grid gap-3 xl:max-h-[calc(100dvh-210px)] xl:grid-rows-[minmax(240px,0.9fr)_minmax(320px,1.1fr)]">
          <section className="app-surface min-h-0 rounded-[24px] p-3">
            <PanelHeader title="品类划分" meta={`${allCategories.length} 个品类`} />
            <div className="mt-3 flex gap-2">
              <input
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                className="min-w-0 flex-1 rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                placeholder="创建新品类"
              />
              <button type="button" onClick={createCategory} className="rounded-full bg-slate-950 px-4 text-sm font-semibold text-white">
                新建
              </button>
            </div>
            <div className="mt-3 grid max-h-[32dvh] gap-2 overflow-y-auto pr-1 xl:max-h-[calc(100%-86px)]">
              {allCategories.map((category) => {
                const count = rows.filter((row) => getRowCategory(row) === category).length;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => applyCategory(category)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(event, (rowIds) => applyCategory(category, rowIds))}
                    className="motion-lift rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-slate-400 hover:bg-white"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-ink">{category}</span>
                      <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-500 ring-1 ring-slate-200">{count}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="app-surface min-h-0 rounded-[24px] p-3">
            <PanelHeader title="对比组匹配" meta={`${groups.length} 个组`} />
            <div className="mt-3 grid gap-2">
              <input
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                className="rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                placeholder="例如：吊杆组 / 灯盘组"
              />
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select
                  value={newGroupCategory}
                  onChange={(event) => setNewGroupCategory(event.target.value)}
                  className="min-w-0 rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                >
                  <option value="">选择品类</option>
                  {allCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
                <button type="button" onClick={createGroup} className="rounded-full bg-slate-950 px-4 text-sm font-semibold text-white">
                  新建
                </button>
              </div>
            </div>

            <div className="mt-3 grid max-h-[42dvh] gap-3 overflow-y-auto pr-1 xl:max-h-[calc(100%-126px)]">
              {groups.map((group) => {
                const groupRows = rows.filter((row) => row.manualMatchKey === group.id);
                return (
                  <div
                    key={group.id}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(event, (rowIds) => applyGroup(group, rowIds))}
                    className="rounded-[18px] border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold text-ink">{group.name}</h4>
                        <p className="truncate text-xs text-slate-500">{group.category} · {groupRows.length} 行</p>
                      </div>
                      <button type="button" onClick={() => onDeleteGroup(group.id)} className="text-xs font-semibold text-slate-400 hover:text-danger">
                        删除
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyGroup(group)}
                      className="mt-2 w-full rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      加入所选物料
                    </button>
                    <div className="mt-2 grid gap-1.5">
                      {groupRows.slice(0, 5).map((row) => (
                        <div key={row.id} className="rounded-[12px] bg-white px-2 py-1.5 text-xs ring-1 ring-slate-200">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-semibold text-ink">{row.materialName}</span>
                            <span className="shrink-0 text-slate-500">{row.supplierName}</span>
                          </div>
                        </div>
                      ))}
                      {groupRows.length === 0 && (
                        <div className="rounded-[12px] border border-dashed border-slate-300 p-3 text-center text-xs text-slate-400">
                          拖入同类物料
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {groups.length === 0 && (
                <div className="rounded-[16px] bg-slate-50 p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">
                  创建对比组后，把不同供应商的同类物料拖进去。
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function MaterialPool({
  rows,
  selectedIds,
  selectedRows,
  onToggleSelected,
  onUpdateSingleRow
}: {
  rows: CanonicalBomRow[];
  selectedIds: string[];
  selectedRows: CanonicalBomRow[];
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
      <div className="mt-3 max-h-[calc(100dvh-300px)] min-h-[420px] overflow-auto rounded-[18px] border border-slate-200 bg-white">
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
                    <input
                      value={getRowCategory(row)}
                      onChange={(event) => onUpdateSingleRow(row, "category", event.target.value)}
                      className="w-32 rounded-[10px] border border-slate-200 bg-white px-2 py-1 text-slate-700 outline-none"
                    />
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
