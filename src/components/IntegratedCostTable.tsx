"use client";

import { useMemo, useState } from "react";
import { CanonicalBomRow } from "@/types/bom";
import { CostComparison, MaterialComparisonItem } from "@/lib/bom/cost-comparison";

type Props = {
  comparison: CostComparison;
  onInspectRows: (rows: CanonicalBomRow[], title: string) => void;
};

type SortKey = "productName" | "materialName" | "category" | "diffRate" | "diffAmount" | "coverage";
type SortDirection = "asc" | "desc";

export function IntegratedCostTable({ comparison, onInspectRows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("diffAmount");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const suppliers = comparison.activeSuppliers;

  const rows = useMemo(() => {
    return [...comparison.materialComparisons].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      return compareByKey(a, b, sortKey) * direction;
    });
  }, [comparison.materialComparisons, sortDirection, sortKey]);

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "productName" || nextKey === "materialName" || nextKey === "category" ? "asc" : "desc");
  }

  return (
    <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">完整成本对比表</h3>
          <p className="text-xs text-slate-500">按物料名称整合，不要求原始文件已分类或完全对齐。</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
          {rows.length} 个物料 / {suppliers.length} 家供应商
        </span>
      </div>

      <div className="max-h-[620px] overflow-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-white/95 text-xs text-slate-500 shadow-sm">
            <tr>
              <SortHeader label="产品" active={sortKey === "productName"} direction={sortDirection} onClick={() => toggleSort("productName")} />
              <SortHeader label="物料" active={sortKey === "materialName"} direction={sortDirection} onClick={() => toggleSort("materialName")} />
              <SortHeader label="标准品类" active={sortKey === "category"} direction={sortDirection} onClick={() => toggleSort("category")} />
              {suppliers.map((supplier) => (
                <th key={supplier} className="whitespace-nowrap border-b border-slate-200 px-3 py-3 text-right font-semibold">
                  {supplier}
                </th>
              ))}
              <SortHeader label="最低单价" active={false} direction={sortDirection} align="right" onClick={() => toggleSort("diffAmount")} />
              <th className="whitespace-nowrap border-b border-slate-200 px-3 py-3 text-right font-semibold">最高单价</th>
              <SortHeader label="差异金额" active={sortKey === "diffAmount"} direction={sortDirection} align="right" onClick={() => toggleSort("diffAmount")} />
              <SortHeader label="差异度" active={sortKey === "diffRate"} direction={sortDirection} align="right" onClick={() => toggleSort("diffRate")} />
              <SortHeader label="覆盖" active={sortKey === "coverage"} direction={sortDirection} align="right" onClick={() => toggleSort("coverage")} />
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr
                key={item.id}
                className="cursor-pointer border-b border-slate-100 bg-white transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-slate-50"
                onClick={() => onInspectRows(item.rows, `整合表来源：${item.productName} / ${item.materialName}`)}
              >
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{item.productName}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-ink">{item.materialName}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{item.category}</td>
                {suppliers.map((supplier) => {
                  const point = item.suppliers.find((entry) => entry.supplierName === supplier);
                  return (
                    <td key={supplier} className="whitespace-nowrap px-3 py-3 text-right text-slate-700">
                      {point ? (
                        <span>
                          {formatMoney(point.unitPrice)}
                          <span className="ml-1 text-xs text-slate-400">x{formatNumber(point.quantity)}</span>
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-warn">缺项</span>
                      )}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-3 py-3 text-right text-slate-700">{formatMoney(item.minPrice)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-slate-700">{formatMoney(item.maxPrice)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-danger">{formatMoney(item.diffAmount)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-danger">{formatPercent(item.diffRate)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-slate-600">
                  {item.suppliers.length}/{suppliers.length}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={suppliers.length + 8} className="px-3 py-10 text-center text-sm text-slate-500">
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

function compareByKey(a: MaterialComparisonItem, b: MaterialComparisonItem, key: SortKey): number {
  if (key === "materialName") return a.materialName.localeCompare(b.materialName, "zh-CN");
  if (key === "productName") return a.productName.localeCompare(b.productName, "zh-CN");
  if (key === "category") return a.category.localeCompare(b.category, "zh-CN");
  if (key === "diffRate") return a.diffRate - b.diffRate;
  if (key === "coverage") return a.suppliers.length - b.suppliers.length;
  return a.diffAmount - b.diffAmount;
}

function formatMoney(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) : "0";
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("zh-CN", { style: "percent", maximumFractionDigits: 1 }) : "0%";
}
