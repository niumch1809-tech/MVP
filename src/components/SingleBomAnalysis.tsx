"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { getComparisonObjectLabel } from "@/lib/bom/cost-comparison";
import {
  buildSingleBomAnalysis,
  type SingleBomCheck,
  type SingleBomInsight
} from "@/lib/bom/single-bom-analysis";
import { getCostCategoryColor, getCostMaterialColor } from "@/lib/design/cost-palette";
import type { CanonicalBomRow } from "@/types/bom";

type Props = {
  rows: CanonicalBomRow[];
  onInspectRows: (rows: CanonicalBomRow[], title: string) => void;
};

const PANEL_CLASS = "dashboard-card dashboard-card-compact motion-lift";
const ACKNOWLEDGED_CHECKS_KEY = "ai-cost-audit.single-bom-acknowledged-checks.v1";

export function SingleBomAnalysis({ rows, onInspectRows }: Props) {
  const objectLabels = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter((row) => row.kind === "supplier_quote")
            .map(getComparisonObjectLabel)
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "zh-CN")),
    [rows]
  );
  const [selectedObject, setSelectedObject] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [acknowledgedChecks, setAcknowledgedChecks] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(ACKNOWLEDGED_CHECKS_KEY) ?? "[]"
      );
      if (Array.isArray(stored)) {
        setAcknowledgedChecks(
          new Set(stored.filter((item): item is string => typeof item === "string"))
        );
      }
    } catch {
      setAcknowledgedChecks(new Set());
    }
  }, []);

  useEffect(() => {
    if (selectedObject && objectLabels.includes(selectedObject)) return;
    setSelectedObject(objectLabels[0] ?? "");
  }, [objectLabels, selectedObject]);

  useEffect(() => {
    setSelectedCategory("");
  }, [selectedObject]);

  const analysis = useMemo(
    () => buildSingleBomAnalysis(rows, selectedObject),
    [rows, selectedObject]
  );

  if (objectLabels.length === 0) {
    return (
      <section className={PANEL_CLASS}>
        <h3 className="type-section-title text-ink">还没有可查看的报价</h3>
        <p className="type-body mt-2 text-slate-500">
          请先到“上传文件”添加一份供应商 BOM。
        </p>
      </section>
    );
  }

  if (!analysis) return null;
  const currentAnalysis = analysis;

  const visibleMaterials = selectedCategory
    ? analysis.materials.filter((item) => item.category === selectedCategory)
    : analysis.materials;
  const topMaterials = visibleMaterials.slice(0, 10);
  const structureTotal = selectedCategory
    ? visibleMaterials.reduce((sum, item) => sum + item.amount, 0)
    : analysis.materialTotal;
  const structureItems = selectedCategory
    ? visibleMaterials.map((item, index) => ({
        key: item.key,
        label: item.materialName,
        amount: item.amount,
        share: structureTotal > 0 ? item.amount / structureTotal : 0,
        rows: item.rows,
        color: getCostMaterialColor(item.materialName, item.category, index)
      }))
    : analysis.categories.map((item, index) => ({
        key: item.category,
        label: item.category,
        amount: item.amount,
        share: item.share,
        rows: item.rows,
        color: getCostCategoryColor(item.category, index)
      }));
  const pendingChecks = analysis.checks
    .filter((check) => check.status !== "good")
    .sort((a, b) => (a.status === "risk" ? -1 : 1) - (b.status === "risk" ? -1 : 1));
  const checksToReview = pendingChecks.filter(
    (check) => !acknowledgedChecks.has(getAcknowledgementKey(analysis, check))
  );
  const passedCheckCount = analysis.checks.length - pendingChecks.length;

  function acknowledgeCheck(check: SingleBomCheck) {
    const key = getAcknowledgementKey(currentAnalysis, check);
    setAcknowledgedChecks((current) => {
      const next = new Set(current);
      next.add(key);
      const stored = Array.from(next).slice(-200);
      try {
        window.localStorage.setItem(ACKNOWLEDGED_CHECKS_KEY, JSON.stringify(stored));
      } catch {
        // The current session still updates even when browser storage is unavailable.
      }
      return new Set(stored);
    });
  }

  return (
    <section className="reveal-in grid min-w-0 max-w-full gap-4 overflow-hidden">
      <section className="dashboard-card dashboard-card-compact">
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.9fr)_minmax(300px,420px)_minmax(280px,0.9fr)] lg:items-end">
          <div>
            <h3 className="type-section-title text-ink">这份报价的钱花在哪里</h3>
            <p className="type-body mt-2 max-w-3xl text-slate-600">
              选择一份报价，查看材料、其他费用和重点物料。
            </p>
          </div>
          <label className="grid gap-1.5 lg:col-start-2">
            <span className="type-caption font-semibold text-slate-600">选择报价</span>
            <select
              value={selectedObject}
              onChange={(event) => setSelectedObject(event.target.value)}
              className="field-shell h-11 w-full rounded-[14px] px-3 text-sm font-semibold text-ink outline-none"
            >
              {objectLabels.map((label) => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
          <span>文件：{analysis.sourceFiles.join(" / ") || "-"}</span>
          <span>工作表：{analysis.sheetNames.join(" / ") || "-"}</span>
          <span>物料：{analysis.materials.length} 项</span>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="最终报价" value={formatMoney(analysis.auditTotal)} caption={analysis.factoryPrice > 0 ? "采用表内出厂价" : "材料与其他费用合计"} />
        <MetricCard label="材料成本" value={formatMoney(analysis.materialTotal)} caption={`占总成本 ${formatPercent(analysis.materialShareOfTotal)}`} />
        <MetricCard label="其他费用" value={formatMoney(analysis.overheadTotal)} caption={analysis.overheadWasDerived ? "由最终报价与材料成本计算" : "来自表内费用"} tone={analysis.overheadWasDerived ? "attention" : "normal"} />
        <MetricCard label="品类" value={`${analysis.categories.length}`} caption="已整理的材料类别" />
        <MetricCard label="物料" value={`${analysis.materials.length}`} caption={`${analysis.detailRows.length} 行明细`} />
        <MetricCard label="前 5 项占比" value={formatPercent(analysis.topFiveShare)} caption="看看成本是否过于集中" tone={analysis.topFiveShare >= 0.7 ? "attention" : "normal"} />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <div className={PANEL_CLASS}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="type-panel-title text-ink">
                {selectedCategory ? `${selectedCategory}物料占比` : "材料成本结构"}
              </h3>
              <p className="type-caption text-slate-500">
                {selectedCategory
                  ? "查看该品类下每项物料的金额和占比。"
                  : "点击品类，继续查看该品类下的物料金额和占比。"}
              </p>
            </div>
            {selectedCategory && (
              <button
                type="button"
                onClick={() => setSelectedCategory("")}
                className="shrink-0 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-ink"
              >
                返回全部品类
              </button>
            )}
          </div>
          <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(280px,0.9fr)_minmax(260px,1.1fr)] md:items-center">
            <div className="h-[300px] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={structureItems}
                    dataKey="amount"
                    nameKey="label"
                    innerRadius={72}
                    outerRadius={112}
                    paddingAngle={2}
                    cursor={selectedCategory ? "default" : "pointer"}
                    onClick={(data) => {
                      if (selectedCategory) return;
                      setSelectedCategory(String(data.label ?? ""));
                    }}
                  >
                    {structureItems.map((item) => (
                      <Cell key={item.key} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, _name, item) => [
                      `${formatMoney(Number(value))} / ${formatPercent(item.payload.share)}`,
                      item.payload.label
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid max-h-[300px] gap-1 overflow-auto pr-1">
              {structureItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  disabled={Boolean(selectedCategory)}
                  onClick={() => setSelectedCategory(item.label)}
                  className={`grid grid-cols-[10px_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-[12px] px-2.5 py-2 text-left transition ${
                    selectedCategory ? "" : "cursor-pointer hover:bg-slate-50"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="truncate text-sm font-semibold text-ink" title={item.label}>{item.label}</span>
                  <span className="text-xs tabular-nums text-slate-500">{formatPercent(item.share)}</span>
                  <span className="min-w-[72px] text-right text-sm font-semibold tabular-nums text-ink">{formatMoney(item.amount)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {checksToReview.length > 0 ? (
          <div className={PANEL_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="type-panel-title text-ink">报价检查</h3>
                <p className="type-caption mt-1 text-slate-500">这里只显示需要补充或确认的内容。</p>
              </div>
              <span className="status-badge bg-amber-50 text-amber-700">
                {checksToReview.length} 项待确认
              </span>
            </div>
            {passedCheckCount > 0 && (
              <p className="mt-3 rounded-[10px] bg-emerald-50/70 px-3 py-2 text-xs font-medium text-emerald-700">
                {passedCheckCount} 项基础检查已完成，没有发现问题。
              </p>
            )}
            <div className="mt-3 grid gap-2">
              {checksToReview.map((check) => (
                <CheckCard
                  key={check.id}
                  check={check}
                  onInspect={() =>
                    onInspectRows(
                      check.rows.length > 0 ? check.rows : currentAnalysis.rows,
                      `需要确认：${check.label}`
                    )
                  }
                  onAcknowledge={() => acknowledgeCheck(check)}
                />
              ))}
            </div>
          </div>
        ) : (
          <QuoteInsights insights={analysis.insights} compact />
        )}
      </section>

      <section className={PANEL_CLASS}>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="type-panel-title text-ink">
              {selectedCategory ? `${selectedCategory}物料金额` : "成本最高的物料"}
            </h3>
            <p className="type-caption text-slate-500">
              {selectedCategory
                ? "按金额展示该品类下的物料，便于快速看清成本构成。"
                : "按金额从高到低排列，优先关注对总成本影响最大的项目。"}
            </p>
          </div>
          <span className="status-badge">{visibleMaterials.length} 项物料</span>
        </div>
        <div className="chart-shell p-3">
          <div className="chart-inner-scroll">
            <div className="h-[360px]" style={{ minWidth: Math.max(720, topMaterials.length * 82) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topMaterials} margin={{ top: 16, right: 16, left: 6, bottom: 70 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="materialName" interval={0} angle={-22} textAnchor="end" height={82} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => formatMoney(Number(value))}
                    labelFormatter={(_label, payload) => payload?.[0]?.payload?.materialName ?? ""}
                  />
                  <Bar dataKey="amount" name="物料金额" radius={[7, 7, 0, 0]} maxBarSize={34}>
                    {topMaterials.map((item, index) => (
                      <Cell key={item.key} fill={getCostMaterialColor(item.materialName, item.category, index)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div className="mt-3 max-h-[420px] overflow-auto rounded-[14px] border border-slate-200/80 bg-white/72">
          <table className="resizable-table type-table text-left">
            <thead className="sticky top-0 z-10 bg-white/95 text-slate-500 shadow-sm">
              <tr>
                <th className="px-3 py-2 font-semibold">关注度</th>
                <th className="px-3 py-2 font-semibold">品类</th>
                <th className="px-3 py-2 font-semibold">物料</th>
                <th className="px-3 py-2 font-semibold">规格</th>
                <th className="px-3 py-2 text-right font-semibold">数量</th>
                <th className="px-3 py-2 text-right font-semibold">金额</th>
                <th className="px-3 py-2 text-right font-semibold">占比</th>
                <th className="px-3 py-2 text-right font-semibold">累计</th>
              </tr>
            </thead>
            <tbody>
              {visibleMaterials.map((item) => (
                <tr
                  key={item.key}
                  className="cursor-pointer border-b border-slate-100 transition hover:bg-blue-50/70"
                  onClick={() => onInspectRows(item.rows, `单表物料来源：${item.materialName}`)}
                >
                  <td className="px-3 py-2"><AbcBadge value={item.abcClass} /></td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{item.category}</td>
                  <td className="max-w-[260px] px-3 py-2 font-semibold text-ink" title={item.materialName}>{item.materialName}</td>
                  <td className="max-w-[280px] truncate px-3 py-2 text-slate-500" title={item.spec}>{item.spec || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600">{formatNumber(item.quantity)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-ink">{formatMoney(item.amount)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600">{formatPercent(item.share)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600">{formatPercent(item.cumulativeShare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {checksToReview.length > 0 && <QuoteInsights insights={analysis.insights} />}
    </section>
  );
}

function QuoteInsights({
  insights,
  compact = false
}: {
  insights: SingleBomInsight[];
  compact?: boolean;
}) {
  return (
    <section className={PANEL_CLASS}>
      <div className="mb-3">
        <h3 className="type-panel-title text-ink">这份报价值得关注什么</h3>
        <p className="type-caption text-slate-500">从成本占比和合计关系中整理出的简要提示。</p>
      </div>
      <div className={`grid gap-3 ${compact ? "" : "md:grid-cols-2 xl:grid-cols-3"}`}>
        {insights.map((insight) => (
          <article
            key={insight.id}
            className={`insight-card border-l-4 ${compact ? "p-3" : "p-4"} ${
              insight.tone === "risk"
                ? "border-l-red-500"
                : insight.tone === "attention"
                  ? "border-l-amber-400"
                  : "border-l-sky-400"
            }`}
          >
            <h4 className="text-sm font-bold text-ink">{insight.title}</h4>
            <p className={`${compact ? "mt-1 text-xs leading-5" : "type-body mt-1.5"} text-slate-600`}>
              {insight.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  caption,
  tone = "normal"
}: {
  label: string;
  value: string;
  caption: string;
  tone?: "normal" | "attention";
}) {
  return (
    <article className="dashboard-card dashboard-card-compact min-w-0">
      <p className="type-caption font-semibold text-slate-500">{label}</p>
      <p className={`mt-2 truncate text-2xl font-bold tabular-nums ${tone === "attention" ? "text-amber-600" : "text-ink"}`} title={value}>{value}</p>
      <p className="mt-1 truncate text-xs text-slate-500" title={caption}>{caption}</p>
    </article>
  );
}

function CheckCard({
  check,
  onInspect,
  onAcknowledge
}: {
  check: SingleBomCheck;
  onInspect?: () => void;
  onAcknowledge: () => void;
}) {
  const statusLabel = check.status === "good" ? "已核对" : check.status === "attention" ? "待确认" : "有问题";
  const statusClass =
    check.status === "good"
      ? "bg-emerald-50 text-emerald-700"
      : check.status === "attention"
        ? "bg-amber-50 text-amber-700"
        : "bg-red-50 text-red-700";

  return (
    <article className="insight-card overflow-hidden">
      {onInspect ? (
        <button
          type="button"
          onClick={onInspect}
          className="w-full cursor-pointer p-3 text-left transition hover:bg-sky-50/40"
          title="查看并修改相关明细"
        >
          <CheckCardContent check={check} statusClass={statusClass} statusLabel={statusLabel} />
        </button>
      ) : (
        <div className="p-3">
          <CheckCardContent check={check} statusClass={statusClass} statusLabel={statusLabel} />
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/55 px-3 py-2">
        <span className="text-[11px] text-slate-500">修改完成或确认无需修改后处理</span>
        <button
          type="button"
          onClick={onAcknowledge}
          className="shrink-0 rounded-[8px] border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
        >
          标记已处理
        </button>
      </div>
    </article>
  );
}

function CheckCardContent({
  check,
  statusClass,
  statusLabel
}: {
  check: SingleBomCheck;
  statusClass: string;
  statusLabel: string;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-ink">{check.label}</span>
        <span className={`status-badge ${statusClass}`}>{statusLabel}</span>
      </div>
      <div className="mt-1.5 text-sm font-semibold tabular-nums text-slate-700">{check.value}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{check.explanation}</p>
    </>
  );
}

function getAcknowledgementKey(
  analysis: NonNullable<ReturnType<typeof buildSingleBomAnalysis>>,
  check: SingleBomCheck
): string {
  return [
    analysis.objectLabel,
    analysis.sourceFiles.join("/"),
    analysis.sheetNames.join("/"),
    check.id,
    check.value,
    check.explanation
  ].join("::");
}

function AbcBadge({ value }: { value: "A" | "B" | "C" }) {
  const style =
    value === "A"
      ? "bg-rose-50 text-rose-700"
      : value === "B"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";
  const label = value === "A" ? "重点" : value === "B" ? "次重点" : "其他";
  return <span className={`inline-flex min-w-12 items-center justify-center rounded-[7px] px-2 py-1 text-[11px] font-bold ${style}`}>{label}</span>;
}

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 4 });
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}
