"use client";

import { Fragment, useMemo, useState } from "react";
import { CanonicalBomRow } from "@/types/bom";
import { CostComparison, MaterialComparisonItem } from "@/lib/bom/cost-comparison";

type Props = {
  comparison: CostComparison;
  outputNameSupplier?: string;
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
      supplierSpecs: Record<string, string>;
      matchKey: string;
      supplierMaterialNames: Record<string, string>;
      productName: string;
      amounts: Record<string, number>;
      diffAmount: number;
      diffRate: number;
      coverage: number;
      totalSlots: number;
      rows: CanonicalBomRow[];
    };

export function IntegratedCostTable({ comparison, outputNameSupplier = "", onInspectRows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("category");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const suppliers = comparison.activeSuppliers;

  const rows = useMemo(
    () => buildDisplayRows(comparison, sortKey, sortDirection, outputNameSupplier),
    [comparison, outputNameSupplier, sortDirection, sortKey]
  );

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "category" || nextKey === "materialName" ? "asc" : "desc");
  }

  return (
    <div className="app-surface w-full min-w-0 max-w-full overflow-hidden rounded-[20px]">
      <div className="flex flex-col gap-2 border-b border-slate-200/80 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="type-panel-title text-ink">完整成本对比表</h3>
          <p className="type-caption text-slate-500">先看分类合计，再展开物料明细；差值默认按第二个对比对象减第一个。</p>
        </div>
        <span className="type-caption rounded-[12px] bg-white/82 px-3 py-1 font-semibold text-slate-600 ring-1 ring-slate-200/80">
          {comparison.materialComparisons.length} 个物料 / {suppliers.length} 个对比对象
        </span>
      </div>

      <div className="max-h-[620px] max-w-full overflow-auto">
        <table
          className="type-table resizable-table text-left"
          style={{ minWidth: Math.max(1180, suppliers.length * 260 + 620) }}
        >
          <thead className="sticky top-0 z-10 bg-white/95 text-slate-500 shadow-sm backdrop-blur">
            <tr>
              <SortHeader label="分类" active={sortKey === "category"} direction={sortDirection} onClick={() => toggleSort("category")} />
              <SortHeader label="名称" active={sortKey === "materialName"} direction={sortDirection} onClick={() => toggleSort("materialName")} />
              {suppliers.map((supplier) => (
                <Fragment key={supplier}>
                  <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-right font-semibold">
                    {supplier}报价
                  </th>
                  <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2 font-semibold">
                    {supplier}规格描述
                  </th>
                </Fragment>
              ))}
              <SortHeader label="差值" active={sortKey === "diffAmount"} direction={sortDirection} align="right" onClick={() => toggleSort("diffAmount")} />
              <SortHeader label="百分比" active={sortKey === "diffRate"} direction={sortDirection} align="right" onClick={() => toggleSort("diffRate")} />
              <SortHeader label="覆盖" active={sortKey === "coverage"} direction={sortDirection} align="right" onClick={() => toggleSort("coverage")} />
              <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2 font-semibold">追溯</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr
                key={item.id}
                className={`cursor-pointer border-b border-slate-100 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-emerald-50/60 ${
                  item.kind === "category" ? "bg-slate-50/80 font-semibold" : "bg-white/92"
                }`}
                onClick={() => onInspectRows(item.rows, `${item.kind === "category" ? "分类合计" : "整合明细"}：${item.category} / ${item.name}`)}
              >
                <td className="whitespace-nowrap px-3 py-2 text-slate-700">{item.category}</td>
                <td className="whitespace-nowrap px-3 py-2 text-ink">
                  {item.kind === "item" ? <span className="mr-2 text-slate-300">└</span> : null}
                  {item.name}
                </td>
                {suppliers.map((supplier) => (
                  <Fragment key={supplier}>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">
                      {item.amounts[supplier] > 0 ? formatMoney(item.amounts[supplier]) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="max-w-[240px] px-3 py-2 text-xs leading-5 text-slate-500">
                      {item.kind === "item" ? item.supplierSpecs[supplier] || <span className="text-slate-300">-</span> : ""}
                    </td>
                  </Fragment>
                ))}
                <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${item.diffAmount >= 0 ? "text-danger" : "text-accent"}`}>
                  {Number.isFinite(item.diffAmount) ? formatMoney(item.diffAmount) : "-"}
                </td>
                <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${item.diffAmount >= 0 ? "text-danger" : "text-accent"}`}>
                  {Number.isFinite(item.diffRate) ? formatPercent(item.diffRate) : "-"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">
                  {item.coverage}/{item.totalSlots}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                  {item.kind === "item" ? `${item.productName || "未指定产品"} / ${item.rows.length} 行来源` : `${item.rows.length} 行来源`}
                </td>
              </tr>
            ))}
            {buildSummaryRows(comparison).map((item) => (
              <tr key={item.label} className="border-b border-slate-100 bg-ink text-white">
                <td className="whitespace-nowrap px-3 py-2">总计核验</td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold">{item.label}</td>
                {suppliers.map((supplier) => (
                  <Fragment key={supplier}>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {item.amounts[supplier] > 0 ? formatMoney(item.amounts[supplier]) : <span className="text-white/35">-</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-white/45">-</td>
                  </Fragment>
                ))}
                <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${item.diffAmount >= 0 ? "text-red-200" : "text-emerald-200"}`}>
                  {Number.isFinite(item.diffAmount) ? formatMoney(item.diffAmount) : "-"}
                </td>
                <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${item.diffAmount >= 0 ? "text-red-200" : "text-emerald-200"}`}>
                  {Number.isFinite(item.diffRate) ? formatPercent(item.diffRate) : "-"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-white/70">-</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-white/65">{item.note}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={suppliers.length * 2 + 6} className="px-3 py-10 text-center text-sm text-slate-500">
                  当前没有可输出数据。请先上传报价 BOM，并确认至少有一个可比较物料。
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
      note: "优先使用表内材料合计，否则由明细汇总",
      amounts: comparison.totals.materialTotals
    },
    {
      label: "人工/管理/利润合计",
      note: "优先使用表内费用，否则由出厂价减材料成本推导",
      amounts: comparison.totals.derivedOverheadTotals
    },
    {
      label: "出厂价",
      note: "来自 BOM/报价表中的最终报价或出厂价",
      amounts: comparison.totals.factoryPriceTotals
    }
  ].map((row) => {
    const pair = getPairDiff(comparison.activeSuppliers.map((supplier) => row.amounts[supplier] ?? 0));
    return { ...row, diffAmount: pair.diffAmount, diffRate: pair.diffRate };
  });
}

function buildDisplayRows(comparison: CostComparison, sortKey: SortKey, sortDirection: SortDirection, outputNameSupplier: string): DisplayRow[] {
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
        name: getOutputMaterialName(item, comparison.activeSuppliers, outputNameSupplier),
        supplierSpecs: item.supplierSpecs,
        matchKey: item.matchKey,
        supplierMaterialNames: item.supplierMaterialNames,
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
    <th className={`whitespace-nowrap border-b border-slate-200 px-3 py-2 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
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

function getOutputMaterialName(item: MaterialComparisonItem, suppliers: string[], preferredSupplier: string): string {
  const orderedSuppliers = preferredSupplier
    ? [preferredSupplier, ...suppliers.filter((supplier) => supplier !== preferredSupplier)]
    : suppliers;
  const name = orderedSuppliers.map((supplier) => item.supplierMaterialNames[supplier]?.trim()).find(Boolean);
  if (name) return name;
  return item.rows.map((row) => row.materialName.trim()).filter(Boolean).join(" / ") || item.materialName;
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
