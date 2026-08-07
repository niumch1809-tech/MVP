"use client";

import type { ReactNode } from "react";
import { buildDecisionReport } from "@/lib/bom/decision-report";
import type { CostComparison } from "@/lib/bom/cost-comparison";
import type { SingleBomAnalysis } from "@/lib/bom/single-bom-analysis";
import { getCostCategoryColor, SUPPLIER_CHART_COLORS } from "@/lib/design/cost-palette";

type MultiProps = {
  id: string;
  comparison: CostComparison;
  supplierAliases: Record<string, string>;
};

type SingleProps = {
  id: string;
  analysis: SingleBomAnalysis;
};

type ChartItem = {
  label: string;
  value: number;
  color: string;
};

export function PrintableMultiCostReport({ id, comparison, supplierAliases }: MultiProps) {
  const decision = buildDecisionReport(comparison);
  const suppliers = [...comparison.supplierTotals].sort((a, b) => a.totalAmount - b.totalAmount);
  const aliases = (name: string) => supplierAliases[name]?.trim() || name;
  const maxTotal = Math.max(...suppliers.map((item) => item.totalAmount), 1);
  const categoryDiffs = comparison.categoryComparison
    .map((item) => {
      const values = comparison.activeSuppliers
        .map((supplier) => ({ supplier, value: Number(item[supplier] ?? 0) }))
        .filter((point) => point.value > 0)
        .sort((a, b) => a.value - b.value);
      const low = values[0];
      const high = values.at(-1);
      return {
        category: item.category,
        values,
        difference: low && high ? high.value - low.value : 0,
        rate: low?.value && high ? (high.value - low.value) / low.value : 0
      };
    })
    .filter((item) => item.difference > 0)
    .sort((a, b) => b.difference - a.difference);
  const materialDiffs = [...comparison.materialComparisons]
    .filter((item) => item.suppliers.filter((point) => point.amount > 0).length >= 2)
    .sort((a, b) => b.diffAmount - a.diffAmount)
    .slice(0, 12);

  return (
    <div id={id} className="pdf-report-source" aria-hidden="true">
      <ReportPage page="01" eyebrow="成本对比报告" title="报价差异，一页先看懂" subtitle="先看总报价与数据可靠性，再定位拉开成本的品类和物料。">
        <div className="pdf-hero-grid">
          <div className="pdf-hero-copy">
            <span className={`pdf-status pdf-status-${decision.tone}`}>本次建议</span>
            <h2>{decision.headline}</h2>
            <p>{decision.summary}</p>
          </div>
          <div className="pdf-metric-grid">
            <ReportMetric label="最低报价" value={formatMoney(suppliers[0]?.totalAmount ?? 0)} />
            <ReportMetric label="报价差额" value={formatMoney(decision.savingAmount)} tone="accent" />
            <ReportMetric label="可比覆盖" value={formatPercent(decision.comparableCoverage)} />
            <ReportMetric label="待检查行" value={`${decision.issueRowCount}`} tone={decision.issueRowCount ? "warning" : "normal"} />
          </div>
        </div>

        <section className="pdf-section pdf-section-grow">
          <SectionHeading title="总报价对比" note={`${suppliers.length} 份报价，金额单位：元`} />
          <div className="pdf-total-chart">
            {suppliers.map((supplier, index) => (
              <div className="pdf-total-row" key={supplier.supplierName}>
                <div className="pdf-total-label" title={supplier.supplierName}>{aliases(supplier.supplierName)}</div>
                <div className="pdf-total-track">
                  <span style={{ width: `${Math.max(5, supplier.totalAmount / maxTotal * 100)}%`, background: SUPPLIER_CHART_COLORS[index % SUPPLIER_CHART_COLORS.length] }} />
                </div>
                <strong>{formatMoney(supplier.totalAmount)}</strong>
              </div>
            ))}
          </div>
        </section>

        <div className="pdf-action-strip">
          <strong>建议动作</strong>
          {decision.nextActions.slice(0, 3).map((action, index) => <p key={action}><span>{index + 1}</span>{action}</p>)}
        </div>
      </ReportPage>

      <ReportPage page="02" eyebrow="成本结构" title="各份报价的钱花在哪里" subtitle="同一品类使用固定颜色，便于横向检查结构变化。">
        <div className="pdf-structure-grid">
          {suppliers.slice(0, 4).map((supplier) => {
            const items = comparison.categoryComparison
              .map((category, index) => ({ label: category.category, value: Number(category[supplier.supplierName] ?? 0), color: getCostCategoryColor(category.category, index) }))
              .filter((item) => item.value > 0)
              .sort((a, b) => b.value - a.value);
            return (
              <section className="pdf-structure-card" key={supplier.supplierName}>
                <div className="pdf-card-title"><div><h3>{aliases(supplier.supplierName)}</h3><p>材料结构合计 {formatMoney(sum(items.map((item) => item.value)))}</p></div><b>{items.length} 类</b></div>
                <div className="pdf-donut-layout">
                  <DonutFigure items={items} />
                  <ChartLegend items={items.slice(0, 8)} total={sum(items.map((item) => item.value))} />
                </div>
              </section>
            );
          })}
        </div>
      </ReportPage>

      <ReportPage page="03" eyebrow="差异定位" title="哪些品类拉开了总价" subtitle="按金额差从高到低排列，优先核对差额大且占比高的品类。">
        <div className="pdf-category-grid">
          {categoryDiffs.slice(0, 9).map((item, index) => (
            <article className="pdf-diff-card" key={item.category}>
              <div className="pdf-rank">{String(index + 1).padStart(2, "0")}</div>
              <div className="pdf-diff-title"><h3>{item.category}</h3><strong>{formatMoney(item.difference)}</strong><span>{formatPercent(item.rate)}</span></div>
              <div className="pdf-mini-bars">
                {item.values.map((point, supplierIndex) => (
                  <div key={point.supplier}><span title={point.supplier}>{aliases(point.supplier)}</span><i><b style={{ width: `${Math.max(4, point.value / Math.max(...item.values.map((value) => value.value), 1) * 100)}%`, background: SUPPLIER_CHART_COLORS[supplierIndex % SUPPLIER_CHART_COLORS.length] }} /></i><em>{formatMoney(point.value)}</em></div>
                ))}
              </div>
            </article>
          ))}
        </div>
        {categoryDiffs.length === 0 && <EmptyReportState text="当前筛选下没有形成可比较的品类差异。" />}
      </ReportPage>

      <ReportPage page="04" eyebrow="关键物料" title="优先向供应商核对这些物料" subtitle="差额使用“最高金额－最低金额”，仅列出至少两份报价都有金额的物料。">
        <table className="pdf-table">
          <thead><tr><th>#</th><th>品类</th><th>物料</th><th>最低金额</th><th>最高金额</th><th>差额</th><th>差异率</th></tr></thead>
          <tbody>
            {materialDiffs.map((item, index) => (
              <tr key={item.id}>
                <td>{String(index + 1).padStart(2, "0")}</td><td>{item.category}</td><td><strong>{item.materialName}</strong></td>
                <td>{formatMoney(item.minAmount)}</td><td>{formatMoney(item.maxAmount)}</td><td className="pdf-accent-number">{formatMoney(item.diffAmount)}</td><td>{formatPercent(item.diffRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pdf-footnote">核对建议：先确认规格、数量与计价口径一致，再讨论价格；缺项物料不参与差额着色和排序。</div>
      </ReportPage>
    </div>
  );
}

export function PrintableSingleCostReport({ id, analysis }: SingleProps) {
  const categoryItems: ChartItem[] = analysis.categories.map((item, index) => ({
    label: item.category,
    value: item.amount,
    color: getCostCategoryColor(item.category, index)
  }));
  const maxMaterial = Math.max(...analysis.materials.slice(0, 10).map((item) => item.amount), 1);
  const pendingChecks = analysis.checks.filter((check) => check.status !== "good");

  return (
    <div id={id} className="pdf-report-source" aria-hidden="true">
      <ReportPage page="01" eyebrow="单份 BOM 成本分析" title={analysis.objectLabel} subtitle={`来源：${analysis.sourceFiles.join(" / ") || "-"} · 工作表：${analysis.sheetNames.join(" / ") || "-"}`}>
        <div className="pdf-metric-grid pdf-metric-grid-six">
          <ReportMetric label="核验总成本" value={formatMoney(analysis.auditTotal)} tone="accent" />
          <ReportMetric label="材料成本" value={formatMoney(analysis.materialTotal)} />
          <ReportMetric label="其他费用" value={formatMoney(analysis.overheadTotal)} />
          <ReportMetric label="材料占比" value={formatPercent(analysis.materialShareOfTotal)} />
          <ReportMetric label="前五项占比" value={formatPercent(analysis.topFiveShare)} />
          <ReportMetric label="待确认" value={`${pendingChecks.length}`} tone={pendingChecks.length ? "warning" : "normal"} />
        </div>

        <div className="pdf-single-main">
          <section className="pdf-section">
            <SectionHeading title="材料成本结构" note={`${analysis.categories.length} 个品类`} />
            <div className="pdf-donut-layout pdf-donut-layout-large"><DonutFigure items={categoryItems} /><ChartLegend items={categoryItems} total={analysis.materialTotal} /></div>
          </section>
          <section className="pdf-section">
            <SectionHeading title="本份报价关注点" note="规则分析结论" />
            <div className="pdf-insight-list">
              {analysis.insights.slice(0, 5).map((insight, index) => <article key={insight.id} className={`pdf-insight pdf-insight-${insight.tone}`}><span>{index + 1}</span><div><h3>{insight.title}</h3><p>{insight.body}</p></div></article>)}
            </div>
          </section>
        </div>
      </ReportPage>

      <ReportPage page="02" eyebrow="重点拆解" title="高金额物料与数据检查" subtitle="先看金额贡献，再处理会影响结论可靠性的待确认项目。">
        <div className="pdf-single-main">
          <section className="pdf-section">
            <SectionHeading title="金额最高的物料" note="Top 10" />
            <div className="pdf-material-bars">
              {analysis.materials.slice(0, 10).map((item, index) => <div key={item.key}><span>{index + 1}</span><strong title={item.materialName}>{item.materialName}</strong><i><b style={{ width: `${Math.max(4, item.amount / maxMaterial * 100)}%`, background: getCostCategoryColor(item.category, index) }} /></i><em>{formatMoney(item.amount)}</em><small>{formatPercent(item.share)}</small></div>)}
            </div>
          </section>
          <section className="pdf-section">
            <SectionHeading title="报价检查" note={pendingChecks.length ? `${pendingChecks.length} 项待确认` : "未发现待确认项"} />
            <div className="pdf-check-list">
              {(pendingChecks.length ? pendingChecks : analysis.checks.slice(0, 4)).map((check) => <article key={check.id}><span className={`pdf-check-dot pdf-check-${check.status}`} /><div><h3>{check.label}</h3><strong>{check.value}</strong><p>{check.explanation}</p></div></article>)}
            </div>
          </section>
        </div>
        <div className="pdf-footnote">说明：本报告用于快速定位核价重点；规格、质量、交期、付款条件仍需结合采购判断。</div>
      </ReportPage>
    </div>
  );
}

function ReportPage({ page, eyebrow, title, subtitle, children }: { page: string; eyebrow: string; title: string; subtitle: string; children: ReactNode }) {
  return <section className="pdf-page"><header className="pdf-page-header"><div><span>{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div><div className="pdf-brand"><b>AI 成本核验</b><small>{page}</small></div></header>{children}<footer className="pdf-page-footer"><span>AI 成本核验平台 · 内部成本分析资料</span><span>{page}</span></footer></section>;
}

function ReportMetric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "accent" | "warning" }) {
  return <div className={`pdf-metric pdf-metric-${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function SectionHeading({ title, note }: { title: string; note: string }) {
  return <div className="pdf-section-heading"><h2>{title}</h2><span>{note}</span></div>;
}

function DonutFigure({ items }: { items: ChartItem[] }) {
  const total = sum(items.map((item) => item.value));
  let offset = 0;
  return <svg className="pdf-donut" viewBox="0 0 220 220" role="img" aria-label="成本结构环形图"><circle cx="110" cy="110" r="72" fill="none" stroke="#eef2f6" strokeWidth="34" />{items.map((item) => { const length = total > 0 ? item.value / total * 452.39 : 0; const currentOffset = offset; offset += length; return <circle key={item.label} cx="110" cy="110" r="72" fill="none" stroke={item.color} strokeWidth="34" strokeDasharray={`${Math.max(0, length - 2)} ${452.39 - Math.max(0, length - 2)}`} strokeDashoffset={-currentOffset} transform="rotate(-90 110 110)" />; })}<text x="110" y="105" textAnchor="middle" className="pdf-donut-label">材料合计</text><text x="110" y="127" textAnchor="middle" className="pdf-donut-value">{formatMoney(total)}</text></svg>;
}

function ChartLegend({ items, total }: { items: ChartItem[]; total: number }) {
  return <div className="pdf-chart-legend">{items.map((item) => <div key={item.label}><i style={{ background: item.color }} /><span title={item.label}>{item.label}</span><em>{formatPercent(total > 0 ? item.value / total : 0)}</em><strong>{formatMoney(item.value)}</strong></div>)}</div>;
}

function EmptyReportState({ text }: { text: string }) { return <div className="pdf-empty-state">{text}</div>; }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function formatMoney(value: number) { return Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatPercent(value: number) { return `${(Number(value || 0) * 100).toFixed(1)}%`; }
