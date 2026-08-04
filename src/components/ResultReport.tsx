"use client";

import type { CanonicalBomRow } from "@/types/bom";
import type { CostComparison, MaterialComparisonItem } from "@/lib/bom/cost-comparison";
import { getMaterialNegotiationAdvice } from "@/lib/bom/material-advice";

type Props = {
  comparison: CostComparison;
  selectedCategory?: string;
  supplierAliases: Record<string, string>;
  onInspectRows: (rows: CanonicalBomRow[], title: string) => void;
};

type SupplierReportRow = {
  supplierName: string;
  displaySupplierName: string;
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

export function ResultReport({ comparison, selectedCategory = "", supplierAliases, onInspectRows }: Props) {
  const supplierRows = buildSupplierReportRows(comparison, supplierAliases);
  const categoryRows = buildCategoryDiffRows(comparison);
  const materialRows = buildMaterialDiffRows(comparison);
  const cheapest = supplierRows[0];
  const highest = supplierRows[supplierRows.length - 1];
  const totalDiff = cheapest && highest ? Math.max(0, highest.totalAmount - cheapest.totalAmount) : 0;
  const topCategory = categoryRows[0];
  const topMaterial = materialRows[0];
  const isCategoryScope = Boolean(selectedCategory);
  const headline = buildHeadline(selectedCategory, totalDiff, topCategory, topMaterial);
  const summary = buildSummary(cheapest, highest, totalDiff, topCategory, topMaterial);
  const comparisonNote = buildComparisonNote(comparison);
  const significantCategoryRows = categoryRows.filter((row) => row.diffAmount >= 15).slice(0, 9);
  const visibleCategoryRows = isCategoryScope
    ? categoryRows.slice(0, 1)
    : significantCategoryRows.length > 0
      ? significantCategoryRows
      : categoryRows.slice(0, 6);
  const visibleMaterialRows = materialRows.slice(0, isCategoryScope ? 3 : 6);

  if (comparison.filteredRows.length === 0) {
    return (
      <section className={PANEL_CLASS}>
        <h3 className="type-section-title text-ink">上传报价后，这里会整理成一份可直接沟通的结论</h3>
        <p className="type-body mt-2 text-slate-500">系统会说明总价差、主要差异品类、贡献最大的物料，以及向供应商核对和谈价的方向。</p>
      </section>
    );
  }

  return (
    <section className="reveal-in grid min-w-0 max-w-full gap-4 overflow-hidden">
      <section className="decision-hero decision-hero-neutral">
        <div className="min-w-0">
          <p className="type-micro text-slate-500">本次结论</p>
          <h3 className="mt-2 text-[clamp(1.5rem,2vw,2.1rem)] font-semibold leading-tight text-ink">{headline}</h3>
          <p className="type-body mt-3 max-w-5xl text-slate-600">{summary}</p>
        </div>
      </section>

      <CategoryDriversPanel
        rows={visibleCategoryRows}
        materialRows={materialRows}
        supplierAliases={supplierAliases}
        selectedCategory={selectedCategory}
        onInspectRows={onInspectRows}
      />

      <MaterialAdvicePanel
        rows={visibleMaterialRows}
        supplierAliases={supplierAliases}
        totalDiff={totalDiff}
        onInspectRows={onInspectRows}
      />

      <p className="rounded-[12px] border border-slate-200 bg-white/70 px-4 py-3 text-xs leading-5 text-slate-500">
        {comparisonNote} 未同时出现的物料会保留为待核对项，不要求两份 BOM 达到 100% 匹配，也不会因此遮住主要成本差异。
      </p>
    </section>
  );
}

function CategoryDriversPanel({
  rows,
  materialRows,
  supplierAliases,
  selectedCategory,
  onInspectRows
}: {
  rows: DiffReportRow[];
  materialRows: DiffReportRow[];
  supplierAliases: Record<string, string>;
  selectedCategory: string;
  onInspectRows: Props["onInspectRows"];
}) {
  const firstPair = rows[0] ? `${rows[0].maxSupplier}\u0000${rows[0].minSupplier}` : "";
  const hasCommonPair = Boolean(firstPair) && rows.every((row) => `${row.maxSupplier}\u0000${row.minSupplier}` === firstPair);
  const commonPairLabel = hasCommonPair && rows[0]
    ? `${displaySupplier(rows[0].maxSupplier, supplierAliases)} 较 ${displaySupplier(rows[0].minSupplier, supplierAliases)}`
    : "";

  if (selectedCategory) {
    const category = rows[0];
    const contributors = materialRows.filter((material) => material.category === selectedCategory).slice(0, 8);
    return (
      <section className={PANEL_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="type-panel-title text-ink">{selectedCategory}差异来自哪里</h3>
            <p className="type-caption mt-1 text-slate-500">品类总差在上方汇总，下面按贡献金额展开物料。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {commonPairLabel && <span className="text-xs text-slate-500">{commonPairLabel}</span>}
            {category && (
              <button
                type="button"
                onClick={() => onInspectRows(category.rows, `品类差异来源：${category.name}`)}
                className="rounded-[10px] bg-slate-950 px-3 py-2 text-left text-white"
              >
                <span className="mr-3 text-xs text-white/60">品类总差</span>
                <strong>{formatMoney(category.diffAmount)}</strong>
                <span className="ml-2 text-xs text-white/60">{formatPercent(category.diffRate)}</span>
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {contributors.map((item, index) => (
            <button
              key={`${item.category}-${item.name}`}
              type="button"
              onClick={() => onInspectRows(item.rows, `${selectedCategory}：${item.name}`)}
              className="group min-w-0 rounded-[13px] border border-slate-200 bg-white p-3.5 text-left transition hover:border-sky-300 hover:bg-sky-50/40 hover:shadow-sm"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="text-[10px] font-semibold text-slate-400">0{index + 1}</span>
                  <span className="mt-1 block truncate text-sm font-semibold text-ink" title={item.name}>{item.displayName}</span>
                </span>
                <strong className="shrink-0 text-base text-ink">+{formatMoney(item.diffAmount)}</strong>
              </span>
              <span className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                <span className="truncate" title={item.maxSupplier}>{displaySupplier(item.maxSupplier, supplierAliases)} 较高</span>
                <span className="shrink-0">{formatPercent(item.diffRate)}</span>
              </span>
            </button>
          ))}
          {contributors.length === 0 && (
            <p className="rounded-[12px] bg-slate-50 p-4 text-sm text-slate-500">当前品类没有已对齐且存在金额差异的物料。</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={PANEL_CLASS}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="type-panel-title text-ink">{selectedCategory ? `${selectedCategory}差异来自哪里` : "哪些品类拉开了总价"}</h3>
          <p className="type-caption mt-1 text-slate-500">展示差价至少 15 元的品类，最多 9 项；再看品类内贡献最大的物料。</p>
        </div>
        <div className="flex items-center gap-2">
          {commonPairLabel && <span className="hidden text-xs text-slate-500 sm:inline">{commonPairLabel}</span>}
          <span className="status-badge">{rows.length} 项</span>
        </div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {rows.map((row, index) => {
          const contributors = materialRows.filter((material) => material.category === row.name).slice(0, 3);
          return (
            <button
              key={row.name}
              type="button"
              onClick={() => onInspectRows(row.rows, `品类差异来源：${row.name}`)}
              className="rounded-[14px] border border-slate-200 bg-white p-3.5 text-left transition hover:border-sky-300 hover:bg-sky-50/30 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[11px] font-semibold text-slate-400">{String(index + 1).padStart(2, "0")}</span>
                  <h4 className="mt-1 truncate text-base font-semibold text-ink">{row.name}</h4>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-lg font-bold text-ink">{formatMoney(row.diffAmount)}</div>
                  <div className="text-xs text-slate-500">{formatPercent(row.diffRate)}</div>
                </div>
              </div>
              {!hasCommonPair && (
                <p className="mt-2 truncate text-xs text-slate-500">
                  {displaySupplier(row.maxSupplier, supplierAliases)} 较 {displaySupplier(row.minSupplier, supplierAliases)} 高
                </p>
              )}
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-600">主要贡献物料</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {contributors.length > 0 ? contributors.map((item) => (
                    <span key={`${row.name}-${item.name}`} className="max-w-full truncate rounded-[7px] bg-slate-50 px-2 py-1 text-xs text-slate-600" title={`${item.displayName} +${formatMoney(item.diffAmount)}`}>
                      {item.displayName} +{formatMoney(item.diffAmount)}
                    </span>
                  )) : <span className="text-xs text-slate-400">暂无已对齐的贡献物料</span>}
                </div>
              </div>
            </button>
          );
        })}
        {rows.length === 0 && <p className="rounded-[12px] bg-slate-50 p-4 text-sm text-slate-500">当前范围没有可比较的品类差异。</p>}
      </div>
    </section>
  );
}

function MaterialAdvicePanel({ rows, supplierAliases, totalDiff, onInspectRows }: {
  rows: DiffReportRow[];
  supplierAliases: Record<string, string>;
  totalDiff: number;
  onInspectRows: Props["onInspectRows"];
}) {
  return (
    <section className={PANEL_CLASS}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="type-panel-title text-ink">需要重点核对的物料</h3>
          <p className="type-caption mt-1 text-slate-500">说明差异可能来自哪里，以及怎样向供应商问清楚。</p>
        </div>
        <span className="status-badge">{rows.length} 项</span>
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        {rows.map((row, index) => {
          const advice = getMaterialNegotiationAdvice(row.displayName, row.category);
          const important = row.diffRate >= 0.5 || row.diffAmount >= Math.max(10, totalDiff * 0.1);
          const totalContribution = totalDiff > 0 ? row.diffAmount / totalDiff : 0;
          return (
            <button
              key={`${row.category}-${row.name}`}
              type="button"
              onClick={() => onInspectRows(row.rows, `重点物料：${row.name}`)}
              className="group grid min-w-0 gap-3 rounded-[14px] border border-slate-200 bg-white p-4 text-left transition hover:border-sky-300 hover:bg-sky-50/30 hover:shadow-sm"
            >
              <span className="flex min-w-0 items-start gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-slate-50 text-xs font-semibold text-ink ring-1 ring-slate-200">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink" title={row.name}>{row.displayName}</span>
                    {important && <span className="shrink-0 rounded-[6px] bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">重点</span>}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">{row.category} · {displaySupplier(row.maxSupplier, supplierAliases)} 较高</span>
                </span>
              </span>

              <span className="grid grid-cols-3 overflow-hidden rounded-[10px] bg-slate-50 ring-1 ring-slate-200/70">
                <span className="px-3 py-2.5">
                  <span className="block text-[10px] text-slate-400">金额差</span>
                  <strong className="mt-0.5 block text-sm text-ink">{formatMoney(row.diffAmount)}</strong>
                </span>
                <span className="border-x border-slate-200/80 px-3 py-2.5">
                  <span className="block text-[10px] text-slate-400">差异比例</span>
                  <strong className="mt-0.5 block text-sm text-ink">{formatPercent(row.diffRate)}</strong>
                </span>
                <span className="px-3 py-2.5">
                  <span className="block text-[10px] text-slate-400">占总价差</span>
                  <strong className="mt-0.5 block text-sm text-ink">{formatPercent(totalContribution)}</strong>
                </span>
              </span>

              <span className="grid gap-2 text-xs leading-5 text-slate-600">
                <span className="rounded-[9px] bg-slate-50/80 px-3 py-2"><strong className="text-slate-800">报价口径：</strong>{displaySupplier(row.minSupplier, supplierAliases)} {formatMoney(row.minValue)}，{displaySupplier(row.maxSupplier, supplierAliases)} {formatMoney(row.maxValue)}</span>
                <span><strong className="text-slate-800">可能原因：</strong>{advice.factors}</span>
                <span><strong className="text-slate-800">建议核对：</strong>{advice.verify}</span>
                <span><strong className="text-slate-800">沟通方向：</strong>{advice.direction}</span>
              </span>
            </button>
          );
        })}
        {rows.length === 0 && <p className="rounded-[12px] bg-slate-50 p-4 text-sm text-slate-500">当前范围没有明显的已对齐物料差异。</p>}
      </div>
    </section>
  );
}

function buildSupplierReportRows(comparison: CostComparison, aliases: Record<string, string>): SupplierReportRow[] {
  const sorted = [...comparison.supplierTotals].sort((a, b) => a.totalAmount - b.totalAmount);
  const min = sorted[0]?.totalAmount ?? 0;
  return sorted.map((row) => ({
    ...row,
    displaySupplierName: displaySupplier(row.supplierName, aliases),
    diffAmount: row.totalAmount - min,
    diffRate: min > 0 ? (row.totalAmount - min) / min : 0,
    totalLabel: formatMoney(row.totalAmount)
  }));
}

function buildCategoryDiffRows(comparison: CostComparison): DiffReportRow[] {
  return comparison.categoryComparison.map((row) => {
    const points = comparison.activeSuppliers.map((supplier) => ({ supplier, value: Number(row[supplier] ?? 0) })).filter((point) => point.value > 0).sort((a, b) => a.value - b.value);
    if (points.length < 2) return null;
    const min = points[0];
    const max = points[points.length - 1];
    return { name: row.category, displayName: row.category, minSupplier: min.supplier, maxSupplier: max.supplier, minValue: min.value, maxValue: max.value, diffAmount: max.value - min.value, diffRate: min.value > 0 ? (max.value - min.value) / min.value : 0, rows: row.rows };
  }).filter((row): row is DiffReportRow => row !== null && row.diffAmount > 0).sort((a, b) => b.diffAmount - a.diffAmount);
}

function buildMaterialDiffRows(comparison: CostComparison): DiffReportRow[] {
  return comparison.materialComparisons.map(buildMaterialDiffRow).filter((row): row is DiffReportRow => row !== null && row.diffAmount > 0).sort((a, b) => b.diffAmount - a.diffAmount);
}

function buildMaterialDiffRow(item: MaterialComparisonItem): DiffReportRow | null {
  const points = item.suppliers.filter((point) => point.amount > 0).sort((a, b) => a.amount - b.amount);
  if (points.length < 2) return null;
  const min = points[0];
  const max = points[points.length - 1];
  return { name: item.materialName, displayName: shortenMaterialName(item.materialName, item.rows), category: item.category, minSupplier: min.supplierName, maxSupplier: max.supplierName, minValue: min.amount, maxValue: max.amount, diffAmount: max.amount - min.amount, diffRate: min.amount > 0 ? (max.amount - min.amount) / min.amount : 0, rows: item.rows };
}

function buildHeadline(selectedCategory: string, totalDiff: number, topCategory?: DiffReportRow, topMaterial?: DiffReportRow) {
  if (selectedCategory) {
    if (topCategory && topMaterial) return `${selectedCategory}相差 ${formatMoney(topCategory.diffAmount)}，主要来自「${topMaterial.displayName}」`;
    if (topCategory) return `${selectedCategory}相差 ${formatMoney(topCategory.diffAmount)}`;
    return `${selectedCategory}暂未发现明显的已对齐物料差异`;
  }
  if (!topCategory) return totalDiff > 0 ? `总报价相差 ${formatMoney(totalDiff)}` : "当前报价总价接近";
  return `总报价相差 ${formatMoney(totalDiff)}，最大品类差异在「${topCategory.name}」`;
}

function buildSummary(cheapest?: SupplierReportRow, highest?: SupplierReportRow, totalDiff = 0, topCategory?: DiffReportRow, topMaterial?: DiffReportRow) {
  if (!cheapest || !highest || cheapest.supplierName === highest.supplierName) return "当前只有一份可用报价，可先查看成本结构和重点物料。";
  const parts = [`${cheapest.displaySupplierName} 报价较低，较 ${highest.displaySupplierName} 低 ${formatMoney(totalDiff)}`];
  if (topCategory) parts.push(`${topCategory.name}品类相差 ${formatMoney(topCategory.diffAmount)}`);
  if (topMaterial) parts.push(`${topMaterial.displayName}是当前贡献较大的物料，差 ${formatMoney(topMaterial.diffAmount)}`);
  return `${parts.join("；")}。建议先确认规格和用量口径，再围绕高差异项逐项沟通。`;
}

function buildComparisonNote(comparison: CostComparison) {
  const totalSlots = comparison.materialComparisons.length * Math.max(1, comparison.activeSuppliers.length);
  const coveredSlots = comparison.materialComparisons.reduce((sum, item) => sum + item.suppliers.filter((point) => point.amount > 0).length, 0);
  const sharedItems = comparison.materialComparisons.filter((item) => item.suppliers.filter((point) => point.amount > 0).length >= 2).length;
  return `本报告基于 ${sharedItems} 个已对齐物料生成，另有 ${Math.max(0, totalSlots - coveredSlots)} 个报价位置未同时出现。`;
}

function displaySupplier(name: string, aliases: Record<string, string>) {
  return aliases[name]?.trim() || name;
}

function shortenMaterialName(materialName: string, rows: CanonicalBomRow[]) {
  const specs = Array.from(new Set(rows.map((row) => row.spec.trim()).filter(Boolean))).sort((a, b) => b.length - a.length);
  let name = materialName.trim();
  specs.forEach((spec) => { if (spec.length >= 2) name = name.replace(spec, ""); });
  name = name.replace(/[（(][^）)]*(mm|cm|m\b|w\b|v\b|k\b|pcs|pc|abs|pet|pe|po|色|白|黑|金|银|透明|磨砂)[^）)]*[）)]/gi, "").replace(/[-_/｜|]?\s*(\d+(\.\d+)?\s*(mm|cm|m|w|v|k|pcs)|dc\s*\d+(\.\d+)?|ac\s*\d+(\.\d+)?|[a-z]*\d+[a-z0-9.-]*|白色|黑色|金色|银色|透明|磨砂).*$/i, "").replace(/\s{2,}/g, " ").trim();
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
