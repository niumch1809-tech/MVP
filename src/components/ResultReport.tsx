"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { CanonicalBomRow } from "@/types/bom";
import type { CostComparison, MaterialComparisonItem } from "@/lib/bom/cost-comparison";
import { getCostCategoryColor, getCostMaterialColor, SUPPLIER_CHART_COLORS } from "@/lib/design/cost-palette";

type Props = {
  comparison: CostComparison;
  selectedCategory?: string;
  onInspectRows: (rows: CanonicalBomRow[], title: string) => void;
};

type SupplierReportRow = {
  supplierName: string;
  totalAmount: number;
  rowCount: number;
  diffAmount: number;
  diffRate: number;
  totalLabel: string;
};

type DiffReportRow = {
  name: string;
  displayName: string;
  category?: string;
  minSupplier: string;
  maxSupplier: string;
  minValue: number;
  maxValue: number;
  diffAmount: number;
  diffRate: number;
  rows: CanonicalBomRow[];
};

const PANEL_CLASS = "dashboard-card dashboard-card-compact motion-lift";
const CHART_CLASS = "chart-shell p-3";

export function ResultReport({ comparison, selectedCategory = "", onInspectRows }: Props) {
  const supplierRows = buildSupplierReportRows(comparison);
  const categoryRows = buildCategoryDiffRows(comparison);
  const materialRows = buildMaterialDiffRows(comparison);
  const cheapest = supplierRows[0];
  const expensive = supplierRows[supplierRows.length - 1];
  const totalDiff = cheapest && expensive ? expensive.totalAmount - cheapest.totalAmount : 0;
  const totalDiffRate = cheapest?.totalAmount ? totalDiff / cheapest.totalAmount : 0;
  const isCategoryScope = Boolean(selectedCategory);
  const categorySummary = categoryRows[0];

  if (comparison.filteredRows.length === 0) {
    return (
      <section className={PANEL_CLASS}>
        <h3 className="type-section-title text-ink">暂无可分析数据</h3>
        <p className="type-body mt-2 text-slate-500">请先上传报价 BOM；如物料名称不一致，先到手工校准页统一品类和匹配关系。</p>
      </section>
    );
  }

  return (
    <section className="reveal-in grid min-w-0 max-w-full gap-4 overflow-hidden">
      <section className="dashboard-card dashboard-card-compact">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="status-badge bg-slate-950 text-white">自动简报</span>
            <h3 className="type-section-title mt-3 text-ink">当前核价结论摘要</h3>
            <p className="type-body mt-2 max-w-4xl text-slate-600">
              按当前筛选范围汇总总价、品类和物料差异。先看结论，再点击差异项追溯 BOM 来源，便于准备供应商沟通清单。
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-3 overflow-hidden rounded-[16px] border border-slate-200/80 bg-white/72 text-center">
            <ReportMetric label="对比对象" value={comparison.activeSuppliers.length.toString()} />
            <ReportMetric label="品类差异" value={categoryRows.length.toString()} />
            <ReportMetric label="物料差异" value={materialRows.length.toString()} tone={materialRows.length > 0 ? "danger" : "normal"} />
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <div className={PANEL_CLASS}>
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="type-panel-title text-ink">总报价对比</h3>
              <p className="type-caption text-slate-500">按报价对象汇总最终报价或核验总成本。</p>
            </div>
            {cheapest && <span className="status-badge bg-emerald-50 text-emerald-700">最低：{cheapest.supplierName}</span>}
          </div>
          <div className={CHART_CLASS}>
            <div className="chart-inner-scroll">
              <div className="h-[300px]" style={{ minWidth: Math.max(520, supplierRows.length * 110) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={supplierRows} margin={{ top: 24, right: 12, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="supplierName" tick={{ fontSize: 12 }} interval={0} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => formatMoney(Number(value))} />
                    <Bar dataKey="totalAmount" name="总报价" radius={[8, 8, 0, 0]} maxBarSize={38}>
                      {supplierRows.map((row, index) => (
                        <Cell key={row.supplierName} fill={SUPPLIER_CHART_COLORS[index % SUPPLIER_CHART_COLORS.length]} />
                      ))}
                      {supplierRows.length <= 6 && <LabelList dataKey="totalLabel" position="top" className="fill-slate-500 text-[10px] font-semibold" />}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        <div className={PANEL_CLASS}>
          <h3 className="type-panel-title text-ink">文字结论</h3>
          <div className="mt-3 grid gap-3">
            {isCategoryScope ? (
              <>
                <ReportPoint
                  title={`${selectedCategory}结论`}
                  body={
                    categorySummary
                      ? `${categorySummary.maxSupplier} 比 ${categorySummary.minSupplier} 高 ${formatMoney(categorySummary.diffAmount)}，约 ${formatPercent(categorySummary.diffRate)}。优先核对该品类下金额差异大的物料、规格和用量。`
                      : `当前 ${selectedCategory} 下暂未识别到可比较的供应商差异。`
                  }
                />
                <ReportList
                  title="品类下物料沟通重点 Top 3"
                  items={materialRows.slice(0, 3).map(formatDiffSummary)}
                  emptyText="当前品类下没有识别到可比较的物料差异。"
                />
              </>
            ) : (
              <>
                {supplierRows.length >= 2 && cheapest && expensive ? (
                  <ReportPoint
                    title="总报价结论"
                    body={`${cheapest.supplierName} 当前最低，为 ${formatMoney(cheapest.totalAmount)}；${expensive.supplierName} 当前最高，为 ${formatMoney(expensive.totalAmount)}。差额 ${formatMoney(totalDiff)}，约 ${formatPercent(totalDiffRate)}。`}
                  />
                ) : (
                  <ReportPoint title="总报价结论" body="当前可比较对象不足 2 个，继续上传报价或确认模板标题是否被正确识别。" />
                )}
                <ReportList
                  title="品类沟通重点 Top 5"
                  items={categoryRows.slice(0, 5).map(formatDiffSummary)}
                  emptyText="当前没有识别到可比较的品类差异。"
                />
                <ReportList
                  title="物料沟通重点 Top 3"
                  items={materialRows.slice(0, 3).map(formatDiffSummary)}
                  emptyText="当前没有识别到可比较的物料差异。"
                />
              </>
            )}
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-2">
        <DiffPanel
          title="品类差异 Top"
          caption="按不同报价对象之间的品类金额差异排序"
          rows={categoryRows.slice(0, 8)}
          colorForName={(name, index) => getCostCategoryColor(name, index)}
          onInspectRows={(row) => onInspectRows(row.rows, `品类差异来源：${row.name}`)}
        />
        <DiffPanel
          title="物料差异 Top"
          caption="按同一物料最高金额与最低金额差异排序"
          rows={materialRows.slice(0, 10)}
          colorForName={(name, index, row) => getCostMaterialColor(name, row.category ?? "", index)}
          onInspectRows={(row) => onInspectRows(row.rows, `物料差异来源：${row.name}`)}
        />
      </section>
    </section>
  );
}

function ReportMetric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "danger" }) {
  return (
    <div className="min-w-[86px] px-4 py-3">
      <div className={`text-xl font-bold ${tone === "danger" ? "text-red-600" : "text-ink"}`}>{value}</div>
      <div className="type-caption text-slate-500">{label}</div>
    </div>
  );
}

function ReportPoint({ title, body }: { title: string; body: string }) {
  return (
    <div className="insight-card p-3">
      <div className="text-sm font-bold text-ink">{title}</div>
      <p className="type-body mt-1 text-slate-600">{body}</p>
    </div>
  );
}

function ReportList({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <div className="insight-card p-3">
      <div className="text-sm font-bold text-ink">{title}</div>
      {items.length > 0 ? (
        <ol className="mt-2 grid gap-1.5 text-[13px] leading-6 text-slate-600">
          {items.map((item, index) => (
            <li key={`${index}-${item}`} className="grid grid-cols-[1.5rem_1fr] gap-1">
              <span className="font-semibold text-slate-400">{index + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="type-body mt-1 text-slate-600">{emptyText}</p>
      )}
    </div>
  );
}

function DiffPanel({
  title,
  caption,
  rows,
  colorForName,
  onInspectRows
}: {
  title: string;
  caption: string;
  rows: DiffReportRow[];
  colorForName: (name: string, index: number, row: DiffReportRow) => string;
  onInspectRows: (row: DiffReportRow) => void;
}) {
  const chartRows = rows.map((row) => ({
    ...row,
    chartName: row.displayName,
    diffLabel: formatMoney(row.diffAmount)
  }));

  return (
    <div className={PANEL_CLASS}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="type-panel-title text-ink">{title}</h3>
          <p className="type-caption text-slate-500">{caption}</p>
        </div>
        <span className="status-badge shrink-0">{rows.length} 项</span>
      </div>
      <div className={CHART_CLASS}>
        <div className="chart-inner-scroll">
          <div className="h-[300px]" style={{ minWidth: Math.max(560, chartRows.length * 82) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} margin={{ top: 24, right: 12, left: 0, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="chartName" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={64} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatMoney(Number(value))} labelFormatter={(_label, payload) => `${payload?.[0]?.payload?.name ?? ""}`} />
                <Bar dataKey="diffAmount" name="差异金额" radius={[8, 8, 0, 0]} maxBarSize={30}>
                  {chartRows.map((row, index) => (
                    <Cell key={row.name} fill={colorForName(row.name, index, row)} />
                  ))}
                  {chartRows.length <= 6 && <LabelList dataKey="diffLabel" position="top" className="fill-slate-500 text-[10px] font-semibold" />}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="mt-3 max-h-[320px] overflow-auto rounded-[14px] border border-slate-200/80 bg-white/72">
        <table className="resizable-table type-table text-left">
          <thead className="sticky top-0 bg-white/95 text-slate-500 shadow-sm">
            <tr>
              <th className="px-3 py-2 font-semibold">对象</th>
              <th className="px-3 py-2 text-right font-semibold">差异</th>
              <th className="px-3 py-2 text-right font-semibold">比例</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.name}
                className="cursor-pointer border-b border-slate-100 transition hover:bg-blue-50/70"
                onClick={() => onInspectRows(row)}
              >
                <td className="max-w-[260px] px-3 py-2">
                  <div className="truncate font-semibold text-ink" title={row.name}>{row.displayName}</div>
                  <div className="truncate text-xs text-slate-500">
                    {row.maxSupplier} vs {row.minSupplier}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-ink">{formatMoney(row.diffAmount)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">{formatPercent(row.diffRate)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-slate-500">暂无可比较差异。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildSupplierReportRows(comparison: CostComparison): SupplierReportRow[] {
  const sorted = [...comparison.supplierTotals].sort((a, b) => a.totalAmount - b.totalAmount);
  const min = sorted[0]?.totalAmount ?? 0;
  return sorted.map((row) => ({
    ...row,
    diffAmount: row.totalAmount - min,
    diffRate: min > 0 ? (row.totalAmount - min) / min : 0,
    totalLabel: formatMoney(row.totalAmount)
  }));
}

function buildCategoryDiffRows(comparison: CostComparison): DiffReportRow[] {
  return comparison.categoryComparison
    .map((row) => {
      const points = comparison.activeSuppliers
        .map((supplier) => ({ supplier, value: Number(row[supplier] ?? 0) }))
        .filter((point) => point.value > 0)
        .sort((a, b) => a.value - b.value);
      if (points.length < 2) return null;
      const min = points[0];
      const max = points[points.length - 1];
      return {
        name: row.category,
        displayName: row.category,
        minSupplier: min.supplier,
        maxSupplier: max.supplier,
        minValue: min.value,
        maxValue: max.value,
        diffAmount: max.value - min.value,
        diffRate: min.value > 0 ? (max.value - min.value) / min.value : 0,
        rows: row.rows
      };
    })
    .filter((row): row is DiffReportRow => row !== null && row.diffAmount > 0)
    .sort((a, b) => b.diffAmount - a.diffAmount);
}

function buildMaterialDiffRows(comparison: CostComparison): DiffReportRow[] {
  return comparison.materialComparisons
    .map((item) => buildMaterialDiffRow(item))
    .filter((row): row is DiffReportRow => row !== null && row.diffAmount > 0)
    .sort((a, b) => b.diffAmount - a.diffAmount);
}

function buildMaterialDiffRow(item: MaterialComparisonItem): DiffReportRow | null {
  const points = item.suppliers
    .filter((point) => point.amount > 0)
    .sort((a, b) => a.amount - b.amount);
  if (points.length < 2) return null;
  const min = points[0];
  const max = points[points.length - 1];
  return {
    name: item.materialName,
    displayName: getMaterialDisplayName(item),
    category: item.category,
    minSupplier: min.supplierName,
    maxSupplier: max.supplierName,
    minValue: min.amount,
    maxValue: max.amount,
    diffAmount: max.amount - min.amount,
    diffRate: min.amount > 0 ? (max.amount - min.amount) / min.amount : 0,
    rows: item.rows
  };
}

function getMaterialDisplayName(item: MaterialComparisonItem) {
  return shortenMaterialName(item.materialName, item.rows);
}

function shortenMaterialName(materialName: string, rows: CanonicalBomRow[]) {
  const specs = Array.from(new Set(rows.map((row) => row.spec.trim()).filter(Boolean))).sort((a, b) => b.length - a.length);
  let name = materialName.trim();
  specs.forEach((spec) => {
    if (spec.length >= 2) name = name.replace(spec, "");
  });

  name = name
    .replace(/[（(][^）)]*(mm|cm|m\b|w\b|v\b|k\b|pcs|pc|abs|pet|pe|po|色|白|黑|金|银|透明|磨砂)[^）)]*[）)]/gi, "")
    .replace(/[-_/｜|]?\s*(\d+(\.\d+)?\s*(mm|cm|m|w|v|k|pcs)|dc\s*\d+(\.\d+)?|ac\s*\d+(\.\d+)?|[a-z]*\d+[a-z0-9.-]*|白色|黑色|金色|银色|透明|磨砂).*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return name || materialName;
}

function formatDiffSummary(row: DiffReportRow) {
  return `${row.displayName}：${row.maxSupplier} 比 ${row.minSupplier} 高 ${formatMoney(row.diffAmount)}，约 ${formatPercent(row.diffRate)}。`;
}

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}
