"use client";

import { useState } from "react";
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
import { DetailsDialog } from "@/components/DetailsDialog";
import { buildDecisionReport, type DecisionPriority } from "@/lib/bom/decision-report";
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
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);
  const supplierRows = buildSupplierReportRows(comparison);
  const categoryRows = buildCategoryDiffRows(comparison);
  const materialRows = buildMaterialDiffRows(comparison);
  const cheapest = supplierRows[0];
  const isCategoryScope = Boolean(selectedCategory);
  const decision = buildDecisionReport(comparison);

  if (comparison.filteredRows.length === 0) {
    return (
      <section className="grid gap-4">
        <div className={PANEL_CLASS}>
          <h3 className="type-section-title text-ink">上传报价后，这里会直接给出建议</h3>
          <p className="type-body mt-2 text-slate-500">系统会先判断数据是否足够，再给出谈价基准、可节省金额和优先沟通项目。</p>
        </div>
        <DecisionExamples />
      </section>
    );
  }

  return (
    <section className="reveal-in grid min-w-0 max-w-full gap-4 overflow-hidden">
      <section className={`decision-hero decision-hero-${decision.tone}`}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="min-w-0">
            <p className="type-micro text-slate-500">建议结论</p>
            <h3 className="mt-2 text-[clamp(1.5rem,2vw,2.1rem)] font-semibold leading-tight text-ink">{decision.headline}</h3>
            <p className="type-body mt-3 max-w-3xl text-slate-600">{decision.summary}</p>
            <button
              type="button"
              onClick={() => setIsRuleDialogOpen(true)}
              className="mt-4 cursor-pointer text-sm font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-ink"
            >
              查看这条建议如何得出
            </button>
          </div>
          <div className="grid min-w-[360px] grid-cols-3 overflow-hidden rounded-[12px] border border-slate-200 bg-white">
            <ReportMetric label="最低报价" value={cheapest ? formatMoney(cheapest.totalAmount) : "-"} />
            <ReportMetric label="可节省" value={formatMoney(decision.savingAmount)} />
            <ReportMetric label="可信度" value={formatPercent(decision.confidenceScore)} tone={decision.confidenceScore < 0.75 ? "danger" : "normal"} />
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(340px,0.78fr)_minmax(0,1.22fr)]">
        <div className="grid content-start gap-4">
          <div className={PANEL_CLASS}>
            <h3 className="type-panel-title text-ink">接下来怎么做</h3>
            <ol className="mt-3 grid gap-2">
              {decision.nextActions.map((action, index) => (
                <li key={action} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 rounded-[10px] bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                  <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-white font-semibold text-ink ring-1 ring-slate-200">{index + 1}</span>
                  <span>{action}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className={PANEL_CLASS}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="type-panel-title text-ink">比较是否可靠</h3>
              <span className={`decision-score ${decision.confidenceScore >= 0.8 ? "decision-score-good" : "decision-score-warn"}`}>
                {formatPercent(decision.confidenceScore)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <ReportMetric label="物料覆盖" value={formatPercent(decision.comparableCoverage)} />
              <ReportMetric label="缺少报价" value={decision.missingSlotCount.toString()} tone={decision.missingSlotCount > 0 ? "danger" : "normal"} />
              <ReportMetric label="待检查" value={decision.issueRowCount.toString()} tone={decision.issueRowCount > 0 ? "danger" : "normal"} />
            </div>
          </div>
        </div>

        <div className={PANEL_CLASS}>
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="type-panel-title text-ink">总报价对比</h3>
              <p className="type-caption text-slate-500">比较当前选择中的最终报价。</p>
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
      </section>

      {isCategoryScope ? (
        <>
          <PriorityPanel
            title={`${selectedCategory}优先核对物料`}
            emptyText="当前品类没有明显的物料差异。"
            items={decision.materialPriorities}
            onInspectRows={onInspectRows}
          />
          <DiffPanel
            title={`${selectedCategory}物料差异`}
            caption="按该品类下物料的金额差异从高到低排列"
            rows={materialRows.slice(0, 10)}
            colorForName={(name, index, row) => getCostMaterialColor(name, row.category ?? "", index)}
            onInspectRows={(row) => onInspectRows(row.rows, `物料差异来源：${row.name}`)}
          />
        </>
      ) : (
        <>
          <section className="grid min-w-0 gap-4 xl:grid-cols-2">
            <PriorityPanel
              title="先谈这些品类"
              emptyText="当前没有明显的品类差异。"
              items={decision.categoryPriorities}
              onInspectRows={onInspectRows}
            />
            <PriorityPanel
              title="先核对这些物料"
              emptyText="当前没有明显的物料差异。"
              items={decision.materialPriorities}
              onInspectRows={onInspectRows}
            />
          </section>
          <section className="grid min-w-0 gap-4 xl:grid-cols-2">
            <DiffPanel
              title="品类差异"
              caption="按金额差异从高到低排列"
              rows={categoryRows.slice(0, 8)}
              colorForName={(name, index) => getCostCategoryColor(name, index)}
              onInspectRows={(row) => onInspectRows(row.rows, `品类差异来源：${row.name}`)}
            />
            <DiffPanel
              title="物料差异"
              caption="按同一物料最高金额与最低金额差异排序"
              rows={materialRows.slice(0, 10)}
              colorForName={(name, index, row) => getCostMaterialColor(name, row.category ?? "", index)}
              onInspectRows={(row) => onInspectRows(row.rows, `物料差异来源：${row.name}`)}
            />
          </section>
        </>
      )}
      <DetailsDialog
        open={isRuleDialogOpen}
        title="建议判断依据"
        eyebrow="规则说明"
        onClose={() => setIsRuleDialogOpen(false)}
      >
        <div className="grid gap-3">
          {decision.ruleNotes.map((note) => (
            <p key={note} className="rounded-[10px] bg-slate-50 p-3 text-sm leading-6 text-slate-700">{note}</p>
          ))}
          <div className="rounded-[10px] border border-slate-200 p-3 text-sm leading-6 text-slate-600">
            当前结果同时考虑总报价、物料覆盖、待检查数据、品类差异和物料差异。系统不会因为某一家总价最低，就在缺项较多时直接推荐选择。
          </div>
        </div>
      </DetailsDialog>
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

function DecisionExamples() {
  const examples = [
    {
      title: "案例一：报价完整、价差明显",
      result: "以最低报价作为谈价基准",
      detail: "物料覆盖较完整、待检查项较少且总价差超过 3% 时，列出可节省金额和优先谈价项目。"
    },
    {
      title: "案例二：最低价存在较多缺项",
      result: "先补齐数据，不直接推荐",
      detail: "可比物料不足 75% 时，先要求确认缺项是否包含在总价中，避免把不完整报价误判为低价。"
    },
    {
      title: "案例三：多份报价总价接近",
      result: "转看质量、交期和条款",
      detail: "总价差不超过 3% 时，价格不再作为唯一判断，并提示核对关键物料规格。"
    }
  ];

  return (
    <section className="grid gap-3 lg:grid-cols-3">
      {examples.map((example, index) => (
        <article key={example.title} className="dashboard-card dashboard-card-compact">
          <span className="text-xs font-semibold text-slate-400">0{index + 1}</span>
          <h4 className="mt-3 text-sm font-semibold text-ink">{example.title}</h4>
          <p className="mt-2 text-base font-semibold text-slate-800">{example.result}</p>
          <p className="mt-2 text-xs leading-6 text-slate-500">{example.detail}</p>
        </article>
      ))}
    </section>
  );
}

function PriorityPanel({
  title,
  items,
  emptyText,
  onInspectRows
}: {
  title: string;
  items: DecisionPriority[];
  emptyText: string;
  onInspectRows: (rows: CanonicalBomRow[], title: string) => void;
}) {
  return (
    <div className={PANEL_CLASS}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="type-panel-title text-ink">{title}</h3>
        <span className="text-xs text-slate-500">{items.length} 项</span>
      </div>
      {items.length > 0 ? (
        <ol className="mt-3 grid gap-2">
          {items.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onInspectRows(item.rows, `${title}：${item.title}`)}
                className="grid w-full cursor-pointer grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] border border-transparent bg-slate-50 p-3 text-left transition-colors hover:border-slate-200 hover:bg-white"
              >
                <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-white text-xs font-semibold text-ink ring-1 ring-slate-200">{index + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{item.detail}</span>
                </span>
                <span className={`rounded-[7px] px-2 py-1 text-[11px] font-semibold ${
                  item.level === "优先" ? "bg-rose-50 text-rose-700" : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}>
                  {item.level}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 rounded-[10px] bg-slate-50 p-4 text-sm text-slate-500">{emptyText}</p>
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

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}
