import type { CanonicalBomRow } from "@/types/bom";
import type { CostComparison, MaterialComparisonItem } from "./cost-comparison";

export type DecisionTone = "positive" | "attention" | "neutral";

export type DecisionPriority = {
  id: string;
  level: "优先" | "其次" | "留意";
  title: string;
  detail: string;
  amount: number;
  rate: number;
  rows: CanonicalBomRow[];
};

export type DecisionReport = {
  headline: string;
  summary: string;
  tone: DecisionTone;
  benchmarkSupplier: string;
  highestSupplier: string;
  savingAmount: number;
  savingRate: number;
  confidenceScore: number;
  comparableCoverage: number;
  issueRowCount: number;
  missingSlotCount: number;
  categoryPriorities: DecisionPriority[];
  materialPriorities: DecisionPriority[];
  nextActions: string[];
  ruleNotes: string[];
};

export function buildDecisionReport(comparison: CostComparison): DecisionReport {
  const supplierTotals = [...comparison.supplierTotals].sort((a, b) => a.totalAmount - b.totalAmount);
  const cheapest = supplierTotals[0];
  const highest = supplierTotals[supplierTotals.length - 1];
  const savingAmount = cheapest && highest ? Math.max(0, highest.totalAmount - cheapest.totalAmount) : 0;
  const savingRate = cheapest?.totalAmount ? savingAmount / cheapest.totalAmount : 0;
  const totalSlots = comparison.materialComparisons.length * Math.max(1, comparison.activeSuppliers.length);
  const coveredSlots = comparison.materialComparisons.reduce((sum, item) => sum + item.suppliers.filter((point) => point.amount > 0).length, 0);
  const missingSlotCount = Math.max(0, totalSlots - coveredSlots);
  const comparableCoverage = totalSlots > 0 ? coveredSlots / totalSlots : 0;
  const issueRowCount = comparison.filteredRows.filter((row) => row.dataIssues.length > 0).length;
  const issueRate = comparison.filteredRows.length > 0 ? issueRowCount / comparison.filteredRows.length : 0;
  const confidenceScore = clamp(comparableCoverage * 0.7 + (1 - Math.min(1, issueRate * 2)) * 0.3);
  const categoryPriorities = buildCategoryPriorities(comparison);
  const materialPriorities = comparison.materialComparisons
    .map(buildMaterialPriority)
    .filter((item): item is DecisionPriority => item !== null)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const base = {
    benchmarkSupplier: cheapest?.supplierName ?? "",
    highestSupplier: highest?.supplierName ?? "",
    savingAmount,
    savingRate,
    confidenceScore,
    comparableCoverage,
    issueRowCount,
    missingSlotCount,
    categoryPriorities,
    materialPriorities
  };

  if (supplierTotals.length < 2) {
    return {
      ...base,
      headline: "先补一份对照报价",
      summary: "当前只有一份报价，可以查看成本结构，但还不能判断价格是否有竞争力。",
      tone: "neutral",
      nextActions: ["补充另一家供应商或上一代产品的报价。", "先检查高金额物料和材料、费用、最终报价是否一致。"],
      ruleNotes: ["案例：只有一份报价时，不直接给出供应商选择建议。"]
    };
  }

  if (comparableCoverage < 0.75 || issueRate > 0.12) {
    return {
      ...base,
      headline: "先补齐数据，再决定价格",
      summary: `当前仍有 ${missingSlotCount} 个缺少报价的位置、${issueRowCount} 行需要确认。最低价可以参考，但不建议直接作为定点依据。`,
      tone: "attention",
      nextActions: [
        "先确认缺项是否已经包含在总价中，避免把不完整报价误判为低价。",
        "处理数量、单价和金额不一致的物料。",
        categoryPriorities[0]
          ? `数据补齐后，先谈 ${categoryPriorities[0].title}。`
          : "数据补齐后再比较品类和物料差异。"
      ],
      ruleNotes: [
        "案例：可比物料不足 75% 时，系统不会仅凭最低总价推荐供应商。",
        "案例：待检查行超过明细的 12% 时，先提示修正数据。"
      ]
    };
  }

  if (savingRate <= 0.03) {
    return {
      ...base,
      headline: "总价接近，价格不是唯一决策点",
      summary: `${cheapest.supplierName} 当前最低，但与最高报价只差 ${formatMoney(savingAmount)}（${formatPercent(savingRate)}）。建议把质量、交期、付款方式和关键物料规格一起纳入选择。`,
      tone: "neutral",
      nextActions: [
        "以最低报价作为价格基准，但不要只按总价定点。",
        materialPriorities[0]
          ? `确认 ${materialPriorities[0].title} 的规格和用量差异。`
          : "确认关键物料规格是否一致。",
        "补充质量、交期和付款条件后再做最终选择。"
      ],
      ruleNotes: ["案例：总价差不超过 3% 时，建议转向质量、交期和条款比较。"]
    };
  }

  return {
    ...base,
    headline: `以 ${cheapest.supplierName} 作为谈价基准`,
    summary: `${cheapest.supplierName} 当前总价最低。相对最高报价可节省 ${formatMoney(savingAmount)}，约 ${formatPercent(savingRate)}。建议先核对规格与缺项，再用高差异品类和物料逐项谈价。`,
    tone: "positive",
    nextActions: [
      `把 ${cheapest.supplierName} 的 ${formatMoney(cheapest.totalAmount)} 作为第一轮价格基准。`,
      categoryPriorities[0]
        ? `先谈 ${categoryPriorities[0].title}，该品类最高与最低相差 ${formatMoney(categoryPriorities[0].amount)}。`
        : "先从金额最高的品类开始谈价。",
      materialPriorities[0]
        ? `重点确认 ${materialPriorities[0].title}，单项差异 ${formatMoney(materialPriorities[0].amount)}。`
        : "继续检查高金额物料的规格和用量。"
    ],
    ruleNotes: [
      "案例：可比覆盖率不低于 75%、数据问题较少且总价差超过 3% 时，以最低报价作为谈价基准。",
      "建议不是自动定点结论；规格、质量、交期和付款条件仍需人工确认。"
    ]
  };
}

function buildCategoryPriorities(comparison: CostComparison): DecisionPriority[] {
  return comparison.categoryComparison
    .map((row): DecisionPriority | null => {
      const values = comparison.activeSuppliers
        .map((supplier) => ({ supplier, amount: Number(row[supplier] ?? 0) }))
        .filter((item) => item.amount > 0)
        .sort((a, b) => a.amount - b.amount);
      if (values.length < 2) return null;
      const low = values[0];
      const high = values[values.length - 1];
      const amount = high.amount - low.amount;
      if (amount <= 0) return null;
      const rate = low.amount > 0 ? amount / low.amount : 0;
      return {
        id: `category-${row.category}`,
        level: rate >= 0.2 || amount >= 2 ? "优先" : "其次",
        title: row.category,
        detail: `${high.supplier} 比 ${low.supplier} 高 ${formatMoney(amount)}（${formatPercent(rate)}）`,
        amount,
        rate,
        rows: row.rows
      };
    })
    .filter((item): item is DecisionPriority => item !== null)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
}

function buildMaterialPriority(item: MaterialComparisonItem): DecisionPriority | null {
  const values = item.suppliers.filter((point) => point.amount > 0).sort((a, b) => a.amount - b.amount);
  if (values.length < 2) return null;
  const low = values[0];
  const high = values[values.length - 1];
  const amount = high.amount - low.amount;
  if (amount <= 0) return null;
  const rate = low.amount > 0 ? amount / low.amount : 0;
  return {
    id: `material-${item.id}`,
    level: rate >= 0.2 || amount >= 0.5 ? "优先" : "留意",
    title: item.materialName,
    detail: `${high.supplierName} 比 ${low.supplierName} 高 ${formatMoney(amount)}（${formatPercent(rate)}）`,
    amount,
    rate,
    rows: item.rows
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function formatMoney(value: number) {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
