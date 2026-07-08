"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { CanonicalBomRow } from "@/types/bom";
import { CostComparison, normalizeCostCategory } from "@/lib/bom/cost-comparison";

type Props = {
  comparison: CostComparison;
  selectedCategory: string;
  onInspectRows: (rows: CanonicalBomRow[], title: string) => void;
};

const SUPPLIER_COLORS = ["#2563eb", "#0f766e", "#b45309", "#7c3aed", "#be123c", "#0891b2"];
const PANEL_CLASS = "border border-slate-200 bg-white p-4 shadow-sm";

export function CostDashboard({ comparison, selectedCategory, onInspectRows }: Props) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 xl:grid-cols-[0.8fr_1.4fr]">
        <section className={PANEL_CLASS}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-ink">
                {selectedCategory ? `${selectedCategory}供应商报价` : "供应商报价"}
              </h2>
              <p className="mt-1 text-xs text-slate-500">按当前筛选汇总供应商 BOM 金额</p>
            </div>
            <span className="text-xs text-slate-500">点击柱子查看来源</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparison.supplierTotals}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="supplierName" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Bar
                  dataKey="totalAmount"
                  fill="#2563eb"
                  name="报价"
                  cursor="pointer"
                  onClick={(data) => {
                    const supplierName = String(data.supplierName ?? "");
                    onInspectRows(
                      comparison.filteredRows.filter((row) => row.supplierName === supplierName),
                      `${selectedCategory || "供应商"}报价来源：${supplierName}`
                    );
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {selectedCategory ? (
          <MaterialChart comparison={comparison} selectedCategory={selectedCategory} onInspectRows={onInspectRows} />
        ) : (
          <CategoryChart comparison={comparison} onInspectRows={onInspectRows} />
        )}
      </div>

      <section className={PANEL_CLASS}>
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">
              {selectedCategory ? `${selectedCategory}物料供应商对比` : "全量物料供应商对比"}
            </h2>
            <p className="text-xs text-slate-500">
              按物料名称完全一致合并，动态支持多家供应商报价列；点击任意行查看来源明细。
            </p>
          </div>
          <span className="text-xs text-slate-500">{comparison.materialComparisons.length} 个物料</span>
        </div>
        <MaterialComparisonTable comparison={comparison} selectedCategory={selectedCategory} onInspectRows={onInspectRows} />
      </section>
    </div>
  );
}

function CategoryChart({ comparison, onInspectRows }: Omit<Props, "selectedCategory">) {
  return (
    <section className={PANEL_CLASS}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">品类成本对比</h2>
          <p className="mt-1 text-xs text-slate-500">用于快速定位成本结构差异</p>
        </div>
        <span className="text-xs text-slate-500">横坐标为品类，柱子为供应商</span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={comparison.categoryComparison}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="category" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => formatMoney(Number(value))} />
            <Legend />
            {comparison.activeSuppliers.map((supplier, index) => (
              <Bar
                key={supplier}
                dataKey={supplier}
                fill={SUPPLIER_COLORS[index % SUPPLIER_COLORS.length]}
                name={supplier}
                cursor="pointer"
                onClick={(data) => {
                  const category = String(data.category ?? "");
                  onInspectRows(
                    comparison.filteredRows.filter(
                      (row) => row.supplierName === supplier && normalizeCostCategory(row.category, row.materialName) === category
                    ),
                    `品类成本来源：${category} / ${supplier}`
                  );
                }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function MaterialChart({ comparison, selectedCategory, onInspectRows }: Props) {
  const chartRows = comparison.materialComparisons.slice(0, 40).map((item) => {
    const result: Record<string, string | number | CanonicalBomRow[]> = {
      materialName: item.materialName,
      rows: item.rows
    };
    comparison.activeSuppliers.forEach((supplier) => {
      result[supplier] = item.suppliers.find((entry) => entry.supplierName === supplier)?.unitPrice ?? 0;
    });
    return result;
  });

  return (
    <section className={PANEL_CLASS}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">{selectedCategory}物料单价对比</h2>
          <p className="mt-1 text-xs text-slate-500">筛选品类后按物料逐项比较供应商单价</p>
        </div>
        <span className="text-xs text-slate-500">横坐标为物料，柱子为供应商</span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartRows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="materialName" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => formatMoney(Number(value))} />
            <Legend />
            {comparison.activeSuppliers.map((supplier, index) => (
              <Bar
                key={supplier}
                dataKey={supplier}
                fill={SUPPLIER_COLORS[index % SUPPLIER_COLORS.length]}
                name={supplier}
                cursor="pointer"
                onClick={(data) => {
                  const rows = Array.isArray(data.rows) ? data.rows : [];
                  const materialName = String(data.materialName ?? "");
                  onInspectRows(rows, `${selectedCategory}物料来源：${materialName}`);
                }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {comparison.materialComparisons.length > chartRows.length && (
        <p className="mt-2 text-xs text-slate-500">图表显示差异最大的前 40 个物料，完整物料仍在下方表格中。</p>
      )}
    </section>
  );
}

function MaterialComparisonTable({ comparison, onInspectRows }: Props) {
  const suppliers = comparison.activeSuppliers;

  return (
    <div className="max-h-[520px] overflow-auto border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-100 text-xs text-slate-600 shadow-sm">
          <tr>
            <th className="whitespace-nowrap px-3 py-2 font-semibold">物料</th>
            <th className="whitespace-nowrap px-3 py-2 font-semibold">品类</th>
            {suppliers.map((supplier) => (
              <th key={supplier} className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                {supplier}
              </th>
            ))}
            <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">最低</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">最高</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">差异</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">覆盖</th>
          </tr>
        </thead>
        <tbody>
          {comparison.materialComparisons.map((item) => (
            <tr
              key={item.id}
              className="cursor-pointer border-b border-slate-100 odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/70"
              onClick={() => onInspectRows(item.rows, `物料来源明细：${item.materialName}`)}
            >
              <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">{item.materialName}</td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-700">{item.category}</td>
              {suppliers.map((supplier) => {
                const point = item.suppliers.find((entry) => entry.supplierName === supplier);
                return (
                  <td key={supplier} className="whitespace-nowrap px-3 py-2 text-right text-slate-700">
                    {point ? formatMoney(point.unitPrice) : "-"}
                  </td>
                );
              })}
              <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{formatMoney(item.minPrice)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{formatMoney(item.maxPrice)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-danger">
                {formatMoney(item.diffAmount)}
                <span className="ml-1 text-xs text-slate-500">{formatPercent(item.diffRate)}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">
                {item.suppliers.length}/{suppliers.length}
              </td>
            </tr>
          ))}
          {comparison.materialComparisons.length === 0 && (
            <tr>
              <td colSpan={suppliers.length + 6} className="px-3 py-6 text-center text-sm text-slate-500">
                当前筛选范围内没有可对比物料。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function formatMoney(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("zh-CN", { style: "percent", maximumFractionDigits: 1 }) : "0%";
}
