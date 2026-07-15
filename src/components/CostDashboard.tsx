"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CanonicalBomRow } from "@/types/bom";
import { CostComparison, MaterialComparisonItem, normalizeCostCategory } from "@/lib/bom/cost-comparison";
import { isRollupCostRow, isSummaryCostItem } from "@/lib/bom/normalize";

type Props = {
  comparison: CostComparison;
  selectedCategory: string;
  onInspectRows: (rows: CanonicalBomRow[], title: string) => void;
};

const SUPPLIER_COLORS = ["#2563eb", "#16a34a", "#f97316", "#7c3aed", "#dc2626", "#0891b2", "#4f46e5", "#ca8a04"];
const CATEGORY_COLORS: Record<string, string> = {
  "结构件": "#2563eb",
  "电子料": "#16a34a",
  "光源": "#f59e0b",
  "包装": "#8b5cf6",
  "人工": "#ef4444",
  "表面处理": "#06b6d4",
  "模具/治具": "#64748b",
  "物流/损耗": "#14b8a6",
  "吊钟组": "#0ea5e9",
  "吊杆组": "#22c55e",
  "端子排/端子座": "#eab308",
  "电线/线组": "#f97316",
  "包装袋": "#a855f7",
  "五金包": "#475569",
  "说明书": "#84cc16",
  "灯盘组": "#0284c7",
  "叶片组": "#db2777",
  "人工/管理/利润": "#dc2626",
  "材料成本合计": "#111827",
  "出厂价": "#0f766e",
  "其他": "#94a3b8"
};
const FALLBACK_COLORS = ["#2563eb", "#16a34a", "#f97316", "#8b5cf6", "#ef4444", "#06b6d4", "#64748b", "#14b8a6"];
const SURFACE_RADIUS = "rounded-[22px]";
const PANEL_CLASS = `app-surface motion-lift ${SURFACE_RADIUS} min-h-[240px] min-w-[320px] max-w-full resize overflow-auto p-4`;
const CHART_SHELL_CLASS = `hairline-grid ${SURFACE_RADIUS} border border-slate-200 bg-slate-50/70 p-3`;
const TABLE_SHELL_CLASS = `overflow-hidden ${SURFACE_RADIUS} border border-slate-200 bg-white`;
const BAR_RADIUS: [number, number, number, number] = [8, 8, 0, 0];
const BAR_SIZE = 32;
const GROUPED_BAR_SIZE = 18;
const BAR_GAP = 3;
const BAR_CATEGORY_GAP = "8%";
type MaterialSortKey = "materialName" | "category" | "minPrice" | "maxPrice" | "diffAmount" | "diffRate" | "coverage";
type MaterialSortDirection = "asc" | "desc";

export function CostDashboard({ comparison, selectedCategory, onInspectRows }: Props) {
  const supplierTotalRows = useMemo(
    () => withDiffMetrics(comparison.supplierTotals, ["totalAmount"]),
    [comparison.supplierTotals]
  );

  return (
    <div className="reveal-in grid gap-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.18fr)]">
        <section className={PANEL_CLASS}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">
                {selectedCategory ? `${selectedCategory}供应商报价` : "供应商报价"}
              </h2>
              <p className="mt-1 text-xs text-slate-500">按当前筛选汇总供应商 BOM 金额</p>
            </div>
            <span className="text-xs text-slate-500">点击柱子查看来源</span>
          </div>
          <div className={CHART_SHELL_CLASS}>
            <div className="mb-2 grid gap-2 sm:grid-cols-2">
              {comparison.supplierTotals.slice(0, 2).map((supplier) => (
                <button
                  key={supplier.supplierName}
                  type="button"
                  className={`motion-lift flex items-center justify-between ${SURFACE_RADIUS} border border-slate-200 bg-white px-3 py-2 text-left text-xs active:scale-[0.99]`}
                  onClick={() =>
                    onInspectRows(
                      comparison.filteredRows.filter((row) => row.supplierName === supplier.supplierName),
                      `${selectedCategory || "供应商"}报价来源：${supplier.supplierName}`
                    )
                  }
                >
                  <span className="font-semibold text-slate-600">{supplier.supplierName}</span>
                  <span className="font-bold text-ink">{formatMoney(supplier.totalAmount)}</span>
                </button>
              ))}
            </div>
            <ChartFrame height={220} minHeight={200} maxHeight={420}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={supplierTotalRows} margin={{ top: 18, right: 10, left: 0, bottom: 0 }} barCategoryGap={BAR_CATEGORY_GAP}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="supplierName" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip content={<DiffTooltip />} />
                <Bar
                  dataKey="totalAmount"
                  fill="#2563eb"
                  name="报价"
                  radius={BAR_RADIUS}
                  barSize={BAR_SIZE}
                  maxBarSize={BAR_SIZE}
                  cursor="pointer"
                  onClick={(data) => {
                    const supplierName = String(data.supplierName ?? "");
                    onInspectRows(
                      comparison.filteredRows.filter((row) => row.supplierName === supplierName),
                      `${selectedCategory || "供应商"}报价来源：${supplierName}`
                    );
                  }}
                >
                  {supplierTotalRows.map((entry, index) => (
                    <Cell
                      key={String(entry.supplierName ?? index)}
                      fill={getSupplierColor(String(entry.supplierName ?? ""), index)}
                    />
                  ))}
                  <LabelList dataKey="totalAmountDiffLabel" position="top" className="fill-slate-500 text-[10px] font-semibold" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </ChartFrame>
          </div>
        </section>

        {selectedCategory ? (
          <MaterialChart comparison={comparison} selectedCategory={selectedCategory} onInspectRows={onInspectRows} />
        ) : (
          <CategoryChart comparison={comparison} onInspectRows={onInspectRows} />
        )}
      </div>

      <TotalCostComparison comparison={comparison} selectedCategory={selectedCategory} onInspectRows={onInspectRows} />

      <SupplierCostStructurePies comparison={comparison} selectedCategory={selectedCategory} onInspectRows={onInspectRows} />

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

function TotalCostComparison({ comparison, selectedCategory, onInspectRows }: Props) {
  const totalRows = useMemo(() => buildTotalCostRows(comparison), [comparison]);
  const chartRows = useMemo(
    () => withDiffMetrics(totalRows, comparison.activeSuppliers),
    [comparison.activeSuppliers, totalRows]
  );

  return (
    <section className={PANEL_CLASS}>
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">总成本对比</h2>
          <p className="text-xs text-slate-500">
            {selectedCategory ? `当前筛选品类：${selectedCategory}，总成本仍按供应商 BOM 口径核验` : "材料、人工/管理/利润与出厂价的供应商横向对比"}
          </p>
        </div>
        <span className="text-xs text-slate-500">悬停查看差值，点击柱子查看来源</span>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className={`${CHART_SHELL_CLASS} overflow-x-auto`}>
          <ChartFrame height={250} minHeight={220} maxHeight={520} minWidth={Math.max(560, totalRows.length * Math.max(92, comparison.activeSuppliers.length * 28))}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} margin={{ top: 18, right: 10, left: 0, bottom: 0 }} barGap={BAR_GAP} barCategoryGap={BAR_CATEGORY_GAP}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="costItem" tick={{ fontSize: 12 }} interval={0} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip content={<DiffTooltip />} />
                <Legend />
                {comparison.activeSuppliers.map((supplier, index) => (
                  <Bar
                    key={supplier}
                    dataKey={supplier}
                    fill={getSupplierColor(supplier, index)}
                    name={supplier}
                    radius={BAR_RADIUS}
                    barSize={GROUPED_BAR_SIZE}
                    maxBarSize={GROUPED_BAR_SIZE}
                    cursor="pointer"
                    onClick={(data) => {
                      const costItem = String(data.costItem ?? "");
                      onInspectRows(getTotalCostSourceRows(comparison, supplier, costItem), `总成本来源：${costItem} / ${supplier}`);
                    }}
                  >
                    <LabelList dataKey={`${supplier}DiffLabel`} position="top" className="fill-slate-500 text-[10px] font-semibold" />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>

        <div className={TABLE_SHELL_CLASS}>
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">成本项</th>
                <th className="px-3 py-2 text-right font-semibold">最低</th>
                <th className="px-3 py-2 text-right font-semibold">最高</th>
                <th className="px-3 py-2 text-right font-semibold">差值</th>
                <th className="px-3 py-2 text-right font-semibold">差异</th>
              </tr>
            </thead>
            <tbody>
              {totalRows.map((row) => {
                const stats = getRowDiffStats(row, comparison.activeSuppliers);
                return (
                  <tr key={row.costItem} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">{row.costItem}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{formatMoney(stats.min)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{formatMoney(stats.max)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-danger">{formatMoney(stats.diffAmount)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-danger">{formatPercent(stats.diffRate)}</td>
                  </tr>
                );
              })}
              {totalRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    暂无可对比的总成本数据。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SupplierCostStructurePies({ comparison, selectedCategory, onInspectRows }: Props) {
  const legendRows = buildSharedPieLegendRows(comparison, selectedCategory);

  return (
    <section className={PANEL_CLASS}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">供应商成本结构占比</h2>
          <p className="mt-1 text-xs text-slate-500">
            {selectedCategory ? `按供应商查看 ${selectedCategory} 下物料金额占比` : "按供应商分别查看各品类占总成本比例"}
          </p>
        </div>
        <span className={`${SURFACE_RADIUS} bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200`}>
          {comparison.activeSuppliers.length} 家供应商
        </span>
      </div>

      {legendRows.length > 0 && (
        <SharedPieLegend
          rows={legendRows}
          selectedCategory={selectedCategory}
          onSelect={(item) => onInspectRows(item.rows, `成本结构来源：${item.name}`)}
        />
      )}

      <div className="mt-3 grid max-h-[520px] gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {comparison.activeSuppliers.map((supplier) => (
          <SupplierPieCard
            key={supplier}
            supplier={supplier}
            comparison={comparison}
            selectedCategory={selectedCategory}
            onInspectRows={onInspectRows}
          />
        ))}
      </div>
      {comparison.activeSuppliers.length === 0 && <p className="text-xs text-slate-500">上传供应商 BOM 后可查看成本结构占比。</p>}
    </section>
  );
}

function SupplierPieCard({
  supplier,
  comparison,
  selectedCategory,
  onInspectRows
}: Props & { supplier: string }) {
  const supplierRows = comparison.filteredRows.filter((row) => row.supplierName === supplier && isVisualCostRow(row));
  const pieRows = selectedCategory
    ? buildSupplierMaterialPieRows(supplierRows)
    : buildSupplierCategoryPieRows(supplierRows);
  const total = pieRows.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className={CHART_SHELL_CLASS}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink">{supplier}</h3>
          <p className="text-xs text-slate-500">{formatMoney(total)}</p>
        </div>
        <span className={`${SURFACE_RADIUS} bg-white px-2 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200`}>
          {pieRows.length} 项
        </span>
      </div>
      <div className="h-[210px] overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <Tooltip
              formatter={(value, _name, item) => {
                const amount = Number(value);
                const percent = total > 0 ? amount / total : 0;
                return [`${formatMoney(amount)} / ${formatPercent(percent)}`, item.name];
              }}
            />
            <Pie
              data={pieRows}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={74}
              paddingAngle={2}
              onClick={(data) => {
                const rows = Array.isArray(data.rows) ? data.rows : [];
                onInspectRows(rows, `${supplier}成本结构来源：${String(data.name ?? "")}`);
              }}
            >
              {pieRows.map((entry, index) => (
                <Cell key={entry.name} fill={getPieSliceColor(entry.name, index, selectedCategory)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      {pieRows.length === 0 && <p className="mt-2 text-xs text-slate-500">当前筛选范围内暂无该供应商占比数据。</p>}
    </div>
  );
}

type PieLegendRow = { name: string; value: number; rows: CanonicalBomRow[] };

function SharedPieLegend({
  rows,
  selectedCategory,
  onSelect
}: {
  rows: PieLegendRow[];
  selectedCategory: string;
  onSelect: (item: PieLegendRow) => void;
}) {
  return (
    <div className="rounded-[20px] bg-white/80 p-2 ring-1 ring-slate-200/80">
      <div className="flex max-h-[132px] flex-wrap gap-1.5 overflow-y-auto pr-1">
        {rows.map((item, index) => {
          const color = getPieSliceColor(item.name, index, selectedCategory);
          return (
            <button
              key={item.name}
              type="button"
              onClick={() => onSelect(item)}
              className="group inline-flex max-w-[260px] items-center gap-2 rounded-[14px] bg-slate-50 px-2.5 py-1.5 text-left transition hover:bg-white hover:ring-1 hover:ring-slate-200"
              title={`${item.name} ${formatMoney(item.value)}`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="truncate text-xs font-semibold text-slate-600 group-hover:text-ink">{item.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function buildSharedPieLegendRows(comparison: CostComparison, selectedCategory: string): PieLegendRow[] {
  const groups = new Map<string, PieLegendRow>();
  comparison.activeSuppliers.forEach((supplier) => {
    const supplierRows = comparison.filteredRows.filter((row) => row.supplierName === supplier && isVisualCostRow(row));
    const pieRows = selectedCategory ? buildSupplierMaterialPieRows(supplierRows) : buildSupplierCategoryPieRows(supplierRows);
    pieRows.forEach((item) => {
      const current = groups.get(item.name) ?? { name: item.name, value: 0, rows: [] };
      current.value += item.value;
      current.rows = [...current.rows, ...item.rows];
      groups.set(item.name, current);
    });
  });
  return Array.from(groups.values()).sort((a, b) => b.value - a.value);
}

function buildTotalCostRows(comparison: CostComparison): Array<Record<string, string | number>> {
  const rows = [
    {
      costItem: "材料成本合计",
      amounts: comparison.totals.materialTotals
    },
    {
      costItem: "人工/管理/利润合计",
      amounts: comparison.totals.derivedOverheadTotals
    },
    {
      costItem: "出厂价",
      amounts: comparison.totals.factoryPriceTotals
    },
    {
      costItem: "核验总成本",
      amounts: buildAuditedTotalAmounts(comparison)
    }
  ];

  return rows
    .map((row) => {
      const result: Record<string, string | number> = { costItem: row.costItem };
      comparison.activeSuppliers.forEach((supplier) => {
        result[supplier] = row.amounts[supplier] ?? 0;
      });
      return result;
    })
    .filter((row) => comparison.activeSuppliers.some((supplier) => Number(row[supplier]) > 0));
}

function buildAuditedTotalAmounts(comparison: CostComparison): Record<string, number> {
  const totals: Record<string, number> = {};
  comparison.activeSuppliers.forEach((supplier) => {
    const factory = comparison.totals.factoryPriceTotals[supplier] ?? 0;
    const material = comparison.totals.materialTotals[supplier] ?? 0;
    const overhead = comparison.totals.derivedOverheadTotals[supplier] ?? 0;
    totals[supplier] = factory > 0 ? factory : material + overhead;
  });
  return totals;
}

function getTotalCostSourceRows(comparison: CostComparison, supplier: string, costItem: string): CanonicalBomRow[] {
  const supplierRows = comparison.filteredRows.filter((row) => row.supplierName === supplier);
  if (costItem === "材料成本合计") {
    return supplierRows.filter((row) => normalizeCostCategory(row.category, row.materialName) === "材料成本合计" || isVisualCostRow(row));
  }
  if (costItem === "人工/管理/利润合计") {
    return supplierRows.filter((row) => ["人工", "人工/管理/利润"].includes(normalizeCostCategory(row.category, row.materialName)));
  }
  if (costItem === "出厂价") {
    return supplierRows.filter((row) => normalizeCostCategory(row.category, row.materialName) === "出厂价");
  }
  return supplierRows;
}

function getRowDiffStats(row: Record<string, string | number>, suppliers: string[]) {
  const values = suppliers
    .map((supplier) => Number(row[supplier]))
    .filter((value) => Number.isFinite(value) && value > 0);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const diffAmount = max - min;
  const diffRate = min > 0 ? diffAmount / min : 0;
  return { min, max, diffAmount, diffRate };
}

function buildSupplierCategoryPieRows(rows: CanonicalBomRow[]) {
  const groups = new Map<string, { name: string; value: number; rows: CanonicalBomRow[] }>();
  rows.forEach((row) => {
    const category = normalizeCostCategory(row.category, row.materialName);
    const current = groups.get(category) ?? { name: category, value: 0, rows: [] };
    current.value += row.amount;
    current.rows.push(row);
    groups.set(category, current);
  });
  return compactChartRows(Array.from(groups.values()).filter((item) => item.value > 0).sort((a, b) => b.value - a.value), 10);
}

function buildSupplierMaterialPieRows(rows: CanonicalBomRow[]) {
  const groups = new Map<string, { name: string; value: number; rows: CanonicalBomRow[] }>();
  rows.forEach((row) => {
    const name = `${row.productName || "未命名产品"} / ${row.materialName}`;
    const current = groups.get(name) ?? { name, value: 0, rows: [] };
    current.value += row.amount;
    current.rows.push(row);
    groups.set(name, current);
  });
  return compactChartRows(Array.from(groups.values()).filter((item) => item.value > 0).sort((a, b) => b.value - a.value), 10);
}

function CategoryChart({ comparison, onInspectRows }: Omit<Props, "selectedCategory">) {
  const chartRows = useMemo(
    () => withDiffMetrics(comparison.categoryComparison, comparison.activeSuppliers),
    [comparison.activeSuppliers, comparison.categoryComparison]
  );

  return (
    <section className={PANEL_CLASS}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">品类成本对比</h2>
          <p className="mt-1 text-xs text-slate-500">用于快速定位成本结构差异</p>
        </div>
        <span className="text-xs text-slate-500">横坐标为品类，柱子为供应商</span>
      </div>
      <div className={`${CHART_SHELL_CLASS} overflow-x-auto`}>
        <ChartFrame height={270} minHeight={230} maxHeight={560} minWidth={Math.max(620, comparison.categoryComparison.length * Math.max(82, comparison.activeSuppliers.length * 28))}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartRows} margin={{ top: 18, right: 10, left: 0, bottom: 0 }} barGap={BAR_GAP} barCategoryGap={BAR_CATEGORY_GAP}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="category" tick={{ fontSize: 12 }} interval={0} angle={-18} textAnchor="end" height={72} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<DiffTooltip />} />
            <Legend />
            {comparison.activeSuppliers.map((supplier, index) => (
              <Bar
                key={supplier}
                dataKey={supplier}
                fill={getSupplierColor(supplier, index)}
                name={supplier}
                radius={BAR_RADIUS}
                barSize={GROUPED_BAR_SIZE}
                maxBarSize={GROUPED_BAR_SIZE}
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
              >
                <LabelList dataKey={`${supplier}DiffLabel`} position="top" className="fill-slate-500 text-[10px] font-semibold" />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
        </ChartFrame>
      </div>
    </section>
  );
}

function MaterialChart({ comparison, selectedCategory, onInspectRows }: Props) {
  const maxChartItems = 24;
  const chartRows = withDiffMetrics(comparison.materialComparisons.slice(0, maxChartItems).map((item) => {
    const result: Record<string, string | number | CanonicalBomRow[]> = {
      materialName: item.materialName,
      productName: item.productName,
      rows: item.rows
    };
    comparison.activeSuppliers.forEach((supplier) => {
      result[supplier] = item.suppliers.find((entry) => entry.supplierName === supplier)?.unitPrice ?? 0;
    });
    return result;
  }), comparison.activeSuppliers);

  return (
    <section className={PANEL_CLASS}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">{selectedCategory}物料单价对比</h2>
          <p className="mt-1 text-xs text-slate-500">筛选品类后按物料逐项比较供应商单价</p>
        </div>
        <span className="text-xs text-slate-500">横坐标为物料，柱子为供应商</span>
      </div>
      <div className={`${CHART_SHELL_CLASS} overflow-x-auto`}>
        <ChartFrame height={300} minHeight={250} maxHeight={620} minWidth={Math.max(680, chartRows.length * Math.max(88, comparison.activeSuppliers.length * 28))}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartRows} margin={{ top: 18, right: 10, left: 0, bottom: 0 }} barGap={BAR_GAP} barCategoryGap={BAR_CATEGORY_GAP}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="materialName" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<DiffTooltip />} />
            <Legend />
            {comparison.activeSuppliers.map((supplier, index) => (
              <Bar
                key={supplier}
                dataKey={supplier}
                fill={getSupplierColor(supplier, index)}
                name={supplier}
                radius={BAR_RADIUS}
                barSize={GROUPED_BAR_SIZE}
                maxBarSize={GROUPED_BAR_SIZE}
                cursor="pointer"
                onClick={(data) => {
                  const rows = Array.isArray(data.rows) ? data.rows : [];
                  const materialName = String(data.materialName ?? "");
                  const productName = String(data.productName ?? "");
                  onInspectRows(rows, `${selectedCategory}物料来源：${productName} / ${materialName}`);
                }}
              >
                <LabelList dataKey={`${supplier}DiffLabel`} position="top" className="fill-slate-500 text-[10px] font-semibold" />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
        </ChartFrame>
      </div>
      {comparison.materialComparisons.length > chartRows.length && (
        <p className="mt-2 text-xs text-slate-500">图表显示差异最大的前 {maxChartItems} 个物料，完整物料仍在下方表格中。</p>
      )}
    </section>
  );
}

function MaterialComparisonTable({ comparison, onInspectRows }: Props) {
  const suppliers = comparison.activeSuppliers;
  const [sortKey, setSortKey] = useState<MaterialSortKey>("diffAmount");
  const [sortDirection, setSortDirection] = useState<MaterialSortDirection>("desc");
  const rows = useMemo(() => {
    return [...comparison.materialComparisons].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      return compareMaterial(a, b, sortKey) * direction;
    });
  }, [comparison.materialComparisons, sortDirection, sortKey]);

  function toggleSort(nextKey: MaterialSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "materialName" || nextKey === "category" ? "asc" : "desc");
  }

  return (
    <div className={`max-h-[500px] overflow-auto ${TABLE_SHELL_CLASS}`}>
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 bg-white/95 text-xs text-slate-600 shadow-sm">
          <tr>
            <th className="whitespace-nowrap px-3 py-2 font-semibold">产品</th>
            <SortableHeader label="物料" active={sortKey === "materialName"} direction={sortDirection} onClick={() => toggleSort("materialName")} />
            <th className="whitespace-nowrap px-3 py-2 font-semibold">匹配键</th>
            <SortableHeader label="品类" active={sortKey === "category"} direction={sortDirection} onClick={() => toggleSort("category")} />
            {suppliers.map((supplier) => (
              <th key={supplier} className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                {supplier}
              </th>
            ))}
            <SortableHeader label="最低" active={sortKey === "minPrice"} direction={sortDirection} align="right" onClick={() => toggleSort("minPrice")} />
            <SortableHeader label="最高" active={sortKey === "maxPrice"} direction={sortDirection} align="right" onClick={() => toggleSort("maxPrice")} />
            <SortableHeader label="差异" active={sortKey === "diffAmount"} direction={sortDirection} align="right" onClick={() => toggleSort("diffAmount")} />
            <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">风险</th>
            <SortableHeader label="覆盖" active={sortKey === "coverage"} direction={sortDirection} align="right" onClick={() => toggleSort("coverage")} />
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const risk = getDiffRisk(item.diffRate, item.suppliers.length, suppliers.length);
            return (
              <tr
                key={item.id}
                className="cursor-pointer border-b border-slate-100 odd:bg-white even:bg-slate-50/50 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-blue-50/70"
                onClick={() => onInspectRows(item.rows, `物料来源明细：${item.productName} / ${item.materialName}`)}
              >
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{item.productName}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">{item.materialName}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{item.matchKey}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-700">{item.category}</td>
                {suppliers.map((supplier) => {
                  const point = item.suppliers.find((entry) => entry.supplierName === supplier);
                  return (
                    <td key={supplier} className="whitespace-nowrap px-3 py-2 text-right text-slate-700">
                      {point ? formatMoney(point.unitPrice) : <span className="text-slate-400">缺项</span>}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{formatMoney(item.minPrice)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{formatMoney(item.maxPrice)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-danger">
                  {formatMoney(item.diffAmount)}
                  <span className="ml-1 text-xs text-slate-500">{formatPercent(item.diffRate)}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <span className={`inline-flex min-w-14 justify-center ${SURFACE_RADIUS} px-2 py-1 text-xs font-semibold ${risk.className}`}>
                    {risk.label}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">
                  {item.suppliers.length}/{suppliers.length}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={suppliers.length + 9} className="px-3 py-6 text-center text-sm text-slate-500">
                当前筛选范围内没有可对比物料。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ChartFrame({
  children,
  height,
  minHeight,
  maxHeight,
  minWidth
}: {
  children: ReactNode;
  height: number;
  minHeight: number;
  maxHeight: number;
  minWidth?: number;
}) {
  return (
    <div
      className="overflow-auto"
      style={{
        height,
        minHeight,
        maxHeight,
        minWidth
      }}
    >
      {children}
    </div>
  );
}

function SortableHeader({
  label,
  active,
  direction,
  align = "left",
  onClick
}: {
  label: string;
  active: boolean;
  direction: MaterialSortDirection;
  align?: "left" | "right";
  onClick: () => void;
}) {
  return (
    <th className={`whitespace-nowrap px-3 py-2 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${SURFACE_RADIUS} px-2 py-1 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-slate-100 ${
          active ? "text-ink" : ""
        }`}
      >
        {label}
        <span className="text-[10px] text-slate-400">{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

function compareMaterial(a: MaterialComparisonItem, b: MaterialComparisonItem, key: MaterialSortKey): number {
  if (key === "materialName") return a.materialName.localeCompare(b.materialName, "zh-CN");
  if (key === "category") return a.category.localeCompare(b.category, "zh-CN");
  if (key === "minPrice") return a.minPrice - b.minPrice;
  if (key === "maxPrice") return a.maxPrice - b.maxPrice;
  if (key === "diffRate") return a.diffRate - b.diffRate;
  if (key === "coverage") return a.suppliers.length - b.suppliers.length;
  return a.diffAmount - b.diffAmount;
}

type DiffChartRow = Record<string, unknown>;
type DiffTooltipPayloadItem = {
  color?: string;
  dataKey?: string | number;
  name?: string | number;
  payload?: DiffChartRow;
  value?: number | string;
};

function withDiffMetrics<T extends DiffChartRow>(rows: T[], valueKeys: string[]): T[] {
  return rows.map((row) => {
    const values = valueKeys
      .map((key) => Number(row[key]))
      .filter((value) => Number.isFinite(value) && value > 0);
    const baseline = values.length > 0 ? Math.min(...values) : 0;
    const next: DiffChartRow = { ...row };

    valueKeys.forEach((key) => {
      const value = Number(row[key]);
      const diffAmount = Number.isFinite(value) && baseline > 0 ? value - baseline : 0;
      const diffRate = baseline > 0 ? diffAmount / baseline : 0;
      next[`${key}DiffAmount`] = diffAmount;
      next[`${key}DiffRate`] = diffRate;
      next[`${key}DiffLabel`] = diffAmount > 0 ? `+${formatPercent(diffRate)}` : "";
    });

    return next as T;
  });
}

function DiffTooltip({ active, payload, label }: { active?: boolean; payload?: DiffTooltipPayloadItem[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload ?? {};
  const visiblePayload = payload.filter((item) => Number(item.value) > 0);

  return (
    <div className={`${SURFACE_RADIUS} border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-xl shadow-slate-900/10 backdrop-blur`}>
      <p className="mb-2 max-w-64 truncate font-semibold text-ink">{label}</p>
      <div className="grid gap-1.5">
        {visiblePayload.map((item) => {
          const key = String(item.dataKey ?? "");
          const diffAmount = Number(row[`${key}DiffAmount`] ?? 0);
          const diffRate = Number(row[`${key}DiffRate`] ?? 0);
          const hasDiff = diffAmount > 0;

          return (
            <div key={key} className="grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-0.5">
              <span className="mt-1 h-2 w-2 rounded-[22px]" style={{ backgroundColor: String(item.color ?? "#2563eb") }} />
              <div>
                <div className="flex min-w-44 items-center justify-between gap-3">
                  <span className="font-medium text-slate-600">{String(item.name ?? key)}</span>
                  <span className="font-semibold text-ink">{formatMoney(Number(item.value))}</span>
                </div>
                <p className={hasDiff ? "text-danger" : "text-slate-400"}>
                  {hasDiff ? `比最低高 ${formatMoney(diffAmount)} / +${formatPercent(diffRate)}` : "当前最低报价"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function isVisualCostRow(row: CanonicalBomRow): boolean {
  return row.amount > 0 && !isSummaryCostItem(row.materialName, row.category) && !isRollupCostRow(row.materialName, row.category);
}

function compactChartRows<T extends { name: string; value: number; rows: CanonicalBomRow[] }>(rows: T[], limit: number): T[] {
  if (rows.length <= limit) return rows;
  const visible = rows.slice(0, limit - 1);
  const otherRows = rows.slice(limit - 1);
  const other = {
    name: "其他",
    value: otherRows.reduce((sum, item) => sum + item.value, 0),
    rows: otherRows.flatMap((item) => item.rows)
  } as T;
  return [...visible, other];
}

function getSupplierColor(supplier: string, fallbackIndex = 0): string {
  return getStableColor(supplier, fallbackIndex, SUPPLIER_COLORS);
}

function getCategoryColor(category: string, fallbackIndex = 0): string {
  return CATEGORY_COLORS[category] ?? getStableColor(category, fallbackIndex);
}

function getPieSliceColor(name: string, fallbackIndex: number, selectedCategory: string): string {
  return selectedCategory ? getStableColor(name, fallbackIndex) : getCategoryColor(name, fallbackIndex);
}

function getStableColor(value: string, fallbackIndex = 0, palette = FALLBACK_COLORS): string {
  const text = value.trim();
  if (!text) return palette[fallbackIndex % palette.length];
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length];
}

function formatMoney(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("zh-CN", { style: "percent", maximumFractionDigits: 1 }) : "0%";
}

function getDiffRisk(diffRate: number, coveredSuppliers: number, totalSuppliers: number): { label: string; className: string } {
  if (coveredSuppliers < totalSuppliers) {
    return { label: "缺项", className: "border border-amber-200 bg-amber-50 text-warn" };
  }
  if (diffRate >= 0.3) {
    return { label: "高差异", className: "border border-red-200 bg-red-50 text-danger" };
  }
  if (diffRate >= 0.12) {
    return { label: "需核验", className: "border border-amber-200 bg-amber-50 text-warn" };
  }
  return { label: "稳定", className: "border border-emerald-200 bg-emerald-50 text-accent" };
}
