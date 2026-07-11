"use client";

import { useMemo, useState } from "react";
import { CanonicalBomRow } from "@/types/bom";
import { CostComparison, MaterialComparisonItem } from "@/lib/bom/cost-comparison";

type Props = {
  comparison: CostComparison;
  onInspectRows: (rows: CanonicalBomRow[], title: string) => void;
};

type SortKey = "category" | "materialName" | "diffRate" | "diffAmount" | "coverage";
type SortDirection = "asc" | "desc";

type DisplayRow =
  | {
      kind: "category";
      id: string;
      category: string;
      name: "分类合计";
      amounts: Record<string, number>;
      diffAmount: number;
      diffRate: number;
      coverage: number;
      totalSlots: number;
      rows: CanonicalBomRow[];
    }
  | {
      kind: "item";
      id: string;
      category: string;
      name: string;
      matchKey: string;
      productName: string;
      amounts: Record<string, number>;
      diffAmount: number;
      diffRate: number;
      coverage: number;
      totalSlots: number;
      rows: CanonicalBomRow[];
    };

export function IntegratedCostTable({ comparison, onInspectRows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("category");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const suppliers = comparison.activeSuppliers;

  const rows = useMemo(() => buildDisplayRows(comparison, sortKey, sortDirection), [comparison, sortDirection, sortKey]);

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "category" || nextKey === "materialName" ? "asc" : "desc");
  }

  return (
    <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">完整成本对比表</h3>
          <p className="text-xs text-slate-500">先按标准分类合计，再展开可追溯明细；差值按第二个对比对象减第一个。</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
          {comparison.materialComparisons.length} 个物料 / {suppliers.length} 个对比对象
        </span>
      </div>

      <div className="max-h-[620px] overflow-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-white/95 text-xs text-slate-500 shadow-sm">
            <tr>
              <SortHeader label="分类" active={sortKey === "category"} direction={sortDirection} onClick={() => toggleSort("category")} />
              <SortHeader label="名称" active={sortKey === "materialName"} direction={sortDirection} onClick={() => toggleSort("materialName")} />
              {suppliers.map((supplier) => (
                <th key={supplier} className="whitespace-nowrap border-b border-slate-200 px-3 py-3 text-right font-semibold">
                  {supplier}报价
                </th>
              ))}
              <SortHeader label="差值" active={sortKey === "diffAmount"} direction={sortDirection} align="right" onClick={() => toggleSort("diffAmount")} />
              <SortHeader label="百分比" active={sortKey === "diffRate"} direction={sortDirection} align="right" onClick={() => toggleSort("diffRate")} />
              <SortHeader label="覆盖" active={sortKey === "coverage"} direction={sortDirection} align="right" onClick={() => toggleSort("coverage")} />
              <th className="whitespace-nowrap border-b border-slate-200 px-3 py-3 font-semibold">追溯</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr
                key={item.id}
                className={`cursor-pointer border-b border-slate-100 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-slate-50 ${
                  item.kind === "category" ? "bg-slate-50/80 font-semibold" : "bg-white"
                }`}
                onClick={() => onInspectRows(item.rows, `${item.kind === "category" ? "分类合计" : "整合明细"}：${item.category} / ${item.name}`)}
              >
                <td className="whitespace-nowrap px-3 py-3 text-slate-700">{item.category}</td>
                <td className="whitespace-nowrap px-3 py-3 text-ink">
                  {item.kind === "item" ? <span className="mr-2 text-slate-300">└</span> : null}
                  {item.name}
                </td>
                {suppliers.map((supplier) => (
                  <td key={supplier} className="whitespace-nowrap px-3 py-3 text-right text-slate-700">
                    {item.amounts[supplier] > 0 ? formatMoney(item.amounts[supplier]) : <span className="text-slate-300">-</span>}
                  </td>
                ))}
                <td className={`whitespace-nowrap px-3 py-3 text-right font-semibold ${item.diffAmount >= 0 ? "text-danger" : "text-accent"}`}>
                  {Number.isFinite(item.diffAmount) ? formatMoney(item.diffAmount) : "-"}
                </td>
                <td className={`whitespace-nowrap px-3 py-3 text-right font-semibold ${item.diffAmount >= 0 ? "text-danger" : "text-accent"}`}>
                  {Number.isFinite(item.diffRate) ? formatPercent(item.diffRate) : "-"}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-slate-600">
                  {item.coverage}/{item.totalSlots}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">
                  {item.kind === "item" ? `${item.productName} / ${item.matchKey}` : `${item.rows.length} 行来源`}
                </td>
              </tr>
            ))}
            {buildSummaryRows(comparison).map((item) => (
              <tr key={item.label} className="border-b border-slate-100 bg-ink text-white">
                <td className="whitespace-nowrap px-3 py-3">总计核验</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold">{item.label}</td>
                {suppliers.map((supplier) => (
                  <td key={supplier} className="whitespace-nowrap px-3 py-3 text-right">
                    {item.amounts[supplier] > 0 ? formatMoney(item.amounts[supplier]) : <span className="text-white/35">-</span>}
                  </td>
                ))}
                <td className={`whitespace-nowrap px-3 py-3 text-right font-semibold ${item.diffAmount >= 0 ? "text-red-200" : "text-emerald-200"}`}>
                  {Number.isFinite(item.diffAmount) ? formatMoney(item.diffAmount) : "-"}
                </td>
                <td className={`whitespace-nowrap px-3 py-3 text-right font-semibold ${item.diffAmount >= 0 ? "text-red-200" : "text-emerald-200"}`}>
                  {Number.isFinite(item.diffRate) ? formatPercent(item.diffRate) : "-"}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-white/70">-</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-white/65">{item.note}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={suppliers.length + 6} className="px-3 py-10 text-center text-sm text-slate-500">
                  当前没有可输出的整合对比数据。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildSummaryRows(comparison: CostComparison) {
  return [
    {
      label: "材料成本合计",
      note: "优先使用表内合计，否则由明细汇总",
      amounts: comparison.totals.materialTotals
    },
    {
      label: "人工/管理/利润合计",
      note: "优先使用表内费用，否则由出厂价减材料成本推导",
      amounts: comparison.totals.derivedOverheadTotals
    },
    {
      label: "出厂价",
      note: "来自 BOM/报价表中的出厂价字段或行",
      amounts: comparison.totals.factoryPriceTotals
    }
  ].map((row) => {
    const pair = getPairDiff(comparison.activeSuppliers.map((supplier) => row.amounts[supplier] ?? 0));
    return { ...row, diffAmount: pair.diffAmount, diffRate: pair.diffRate };
  });
}

function buildDisplayRows(comparison: CostComparison, sortKey: SortKey, sortDirection: SortDirection): DisplayRow[] {
  const direction = sortDirection === "asc" ? 1 : -1;
  const rows: DisplayRow[] = [];

  comparison.categories.forEach((category) => {
    const items = comparison.materialComparisons.filter((item) => item.category === category);
    if (items.length === 0) return;

    const sortedItems = [...items].sort((a, b) => compareItem(a, b, sortKey) * direction);
    const categoryAmounts = Object.fromEntries(
      comparison.activeSuppliers.map((supplier) => [
        supplier,
        sortedItems.reduce((sum, item) => sum + getSupplierAmount(item, supplier), 0)
      ])
    );
    const pair = getPairDiff(comparison.activeSuppliers.map((supplier) => categoryAmounts[supplier] ?? 0));

    rows.push({
      kind: "category",
      id: `category-${category}`,
      category,
      name: "分类合计",
      amounts: categoryAmounts,
      diffAmount: pair.diffAmount,
      diffRate: pair.diffRate,
      coverage: sortedItems.reduce((sum, item) => sum + item.suppliers.length, 0),
      totalSlots: sortedItems.length * comparison.activeSuppliers.length,
      rows: sortedItems.flatMap((item) => item.rows)
    });

    sortedItems.forEach((item) => {
      const amounts = Object.fromEntries(comparison.activeSuppliers.map((supplier) => [supplier, getSupplierAmount(item, supplier)]));
      const itemPair = getPairDiff(comparison.activeSuppliers.map((supplier) => amounts[supplier] ?? 0));
      rows.push({
        kind: "item",
        id: item.id,
        category: item.category,
        name: item.materialName,
        matchKey: item.matchKey,
        productName: item.productName,
        amounts,
        diffAmount: itemPair.diffAmount,
        diffRate: itemPair.diffRate,
        coverage: item.suppliers.length,
        totalSlots: comparison.activeSuppliers.length,
        rows: item.rows
      });
    });
  });

  return rows;
}

function SortHeader({
  label,
  active,
  direction,
  align = "left",
  onClick
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  align?: "left" | "right";
  onClick: () => void;
}) {
  return (
    <th className={`whitespace-nowrap border-b border-slate-200 px-3 py-3 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-slate-100 ${
          active ? "text-ink" : ""
        }`}
      >
        {label}
        <span className="text-[10px] text-slate-400">{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

function compareItem(a: MaterialComparisonItem, b: MaterialComparisonItem, key: SortKey): number {
  if (key === "materialName") return a.materialName.localeCompare(b.materialName, "zh-CN");
  if (key === "category") return a.category.localeCompare(b.category, "zh-CN") || a.materialName.localeCompare(b.materialName, "zh-CN");
  if (key === "diffRate") return a.diffRate - b.diffRate;
  if (key === "coverage") return a.suppliers.length - b.suppliers.length;
  return a.diffAmount - b.diffAmount;
}

function getSupplierAmount(item: MaterialComparisonItem, supplier: string): number {
  return item.suppliers.find((entry) => entry.supplierName === supplier)?.amount ?? 0;
}

function getPairDiff(values: number[]): { diffAmount: number; diffRate: number } {
  if (values.length < 2 || values[0] <= 0) return { diffAmount: Number.NaN, diffRate: Number.NaN };
  const diffAmount = values[1] - values[0];
  return { diffAmount, diffRate: diffAmount / values[0] };
}

function formatMoney(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("zh-CN", { style: "percent", maximumFractionDigits: 1 }) : "0%";
}
