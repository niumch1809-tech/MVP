import type { CanonicalBomRow } from "@/types/bom";
import { buildCostComparison, getComparisonObjectLabel, getEffectiveCostCategory } from "./cost-comparison";
import { getMaterialNegotiationAdvice } from "./material-advice";
import { isRollupCostRow, isSummaryCostRow } from "./normalize";

export type SingleBomCategoryItem = {
  category: string;
  amount: number;
  share: number;
  rowCount: number;
  rows: CanonicalBomRow[];
};

export type SingleBomMaterialItem = {
  key: string;
  materialName: string;
  category: string;
  spec: string;
  quantity: number;
  amount: number;
  share: number;
  cumulativeShare: number;
  abcClass: "A" | "B" | "C";
  rows: CanonicalBomRow[];
};

export type SingleBomCheck = {
  id: string;
  label: string;
  status: "good" | "attention" | "risk";
  value: string;
  explanation: string;
  rows: CanonicalBomRow[];
};

export type SingleBomInsight = {
  id: string;
  title: string;
  body: string;
  tone: "neutral" | "attention" | "risk";
};

export type SingleBomAnalysis = {
  objectLabel: string;
  sourceFiles: string[];
  sheetNames: string[];
  rows: CanonicalBomRow[];
  detailRows: CanonicalBomRow[];
  materialDetailTotal: number;
  declaredMaterialTotal: number;
  materialTotal: number;
  explicitOverhead: number;
  overheadTotal: number;
  factoryPrice: number;
  auditTotal: number;
  overheadWasDerived: boolean;
  materialShareOfTotal: number;
  overheadShareOfTotal: number;
  topFiveShare: number;
  categories: SingleBomCategoryItem[];
  materials: SingleBomMaterialItem[];
  checks: SingleBomCheck[];
  insights: SingleBomInsight[];
};

export function buildSingleBomAnalysis(
  rows: CanonicalBomRow[],
  objectLabel: string
): SingleBomAnalysis | null {
  const objectRows = rows.filter(
    (row) => row.kind === "supplier_quote" && getComparisonObjectLabel(row) === objectLabel
  );
  if (objectRows.length === 0) return null;

  const detailRows = objectRows.filter(isMaterialDetailRow);
  const materialDetailTotal = sumAmounts(detailRows);
  const declaredMaterialRows = objectRows.filter(
    (row) => effectiveCategory(row) === "材料成本合计"
  );
  const overheadRows = objectRows.filter(
    (row) =>
      ["人工", "人工/管理/利润"].includes(effectiveCategory(row)) &&
      (!isRollupCostRow(row.materialName, row.category) || isManualSummaryEntry(row))
  );
  const factoryPriceRows = objectRows.filter((row) => effectiveCategory(row) === "出厂价");
  const declaredMaterialTotal = pickLargestAmount(declaredMaterialRows);
  const factoryPrice = pickLargestAmount(factoryPriceRows);

  const comparison = buildCostComparison(rows, {
    supplierNames: [objectLabel],
    productName: "",
    category: "",
    materialQuery: ""
  });
  const materialTotal = comparison.totals.materialTotals[objectLabel] ?? materialDetailTotal;
  const explicitOverhead =
    comparison.totals.overheadTotals[objectLabel] ??
    sumAmounts(overheadRows);
  const overheadTotal =
    comparison.totals.derivedOverheadTotals[objectLabel] ??
    explicitOverhead;
  const auditTotal = factoryPrice || materialTotal + overheadTotal;
  const overheadWasDerived = explicitOverhead <= 0 && overheadTotal > 0 && factoryPrice > 0;
  const categories = buildCategoryItems(detailRows, materialDetailTotal);
  const materials = buildMaterialItems(detailRows, materialDetailTotal);
  const topFiveShare = materials.slice(0, 5).reduce((sum, item) => sum + item.amount, 0) /
    (materialDetailTotal || 1);
  const checks = buildChecks({
    objectRows,
    detailRows,
    declaredMaterialRows,
    overheadRows,
    factoryPriceRows,
    materialDetailTotal,
    declaredMaterialTotal,
    materialTotal,
    explicitOverhead,
    overheadTotal,
    factoryPrice,
    auditTotal,
    overheadWasDerived
  });

  return {
    objectLabel,
    sourceFiles: unique(objectRows.map((row) => row.sourceFileName).filter(Boolean)),
    sheetNames: unique(objectRows.map((row) => row.sheetName).filter(Boolean)),
    rows: objectRows,
    detailRows,
    materialDetailTotal,
    declaredMaterialTotal,
    materialTotal,
    explicitOverhead,
    overheadTotal,
    factoryPrice,
    auditTotal,
    overheadWasDerived,
    materialShareOfTotal: auditTotal > 0 ? materialTotal / auditTotal : 0,
    overheadShareOfTotal: auditTotal > 0 ? overheadTotal / auditTotal : 0,
    topFiveShare,
    categories,
    materials,
    checks,
    insights: buildInsights({
      categories,
      materials,
      materialDetailTotal,
      declaredMaterialTotal,
      materialTotal,
      overheadTotal,
      auditTotal,
      overheadWasDerived,
      topFiveShare,
      issueCount: objectRows.reduce((sum, row) => sum + row.dataIssues.length, 0)
    })
  };
}

function isManualSummaryEntry(row: CanonicalBomRow): boolean {
  return row.originalFields?.entrySource === "manual-summary" || row.raw?.entrySource === "manual-summary";
}

function isMaterialDetailRow(row: CanonicalBomRow): boolean {
  const category = effectiveCategory(row);
  return (
    row.amount > 0 &&
    !["材料成本合计", "人工", "人工/管理/利润", "出厂价"].includes(category) &&
    !isSummaryCostRow(row) &&
    !isRollupCostRow(row.materialName, row.category)
  );
}

function effectiveCategory(row: CanonicalBomRow): string {
  return getEffectiveCostCategory(row);
}

function buildCategoryItems(
  rows: CanonicalBomRow[],
  materialDetailTotal: number
): SingleBomCategoryItem[] {
  const groups = new Map<string, CanonicalBomRow[]>();
  rows.forEach((row) => {
    const category = effectiveCategory(row);
    groups.set(category, [...(groups.get(category) ?? []), row]);
  });

  return Array.from(groups.entries())
    .map(([category, categoryRows]) => {
      const amount = sumAmounts(categoryRows);
      return {
        category,
        amount,
        share: materialDetailTotal > 0 ? amount / materialDetailTotal : 0,
        rowCount: categoryRows.length,
        rows: categoryRows
      };
    })
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category, "zh-CN"));
}

function buildMaterialItems(
  rows: CanonicalBomRow[],
  materialDetailTotal: number
): SingleBomMaterialItem[] {
  const groups = new Map<string, CanonicalBomRow[]>();
  rows.forEach((row) => {
    const key =
      row.manualMatchKey?.trim() ||
      row.manualName?.trim() ||
      row.normalizedName.split("|")[0]?.trim() ||
      row.materialName.trim() ||
      row.id;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  const grouped = Array.from(groups.entries())
    .map(([key, materialRows]) => {
      const amount = sumAmounts(materialRows);
      const names = unique(
        materialRows.map((row) => row.manualName?.trim() || row.materialName.trim()).filter(Boolean)
      );
      const specs = unique(materialRows.map((row) => row.spec.trim()).filter(Boolean));
      return {
        key,
        materialName: names.join(" / ") || "未命名物料",
        category: effectiveCategory(materialRows[0]),
        spec: specs.join(" / "),
        quantity: materialRows.reduce((sum, row) => sum + row.quantity, 0),
        amount,
        share: materialDetailTotal > 0 ? amount / materialDetailTotal : 0,
        rows: materialRows
      };
    })
    .sort((a, b) => b.amount - a.amount || a.materialName.localeCompare(b.materialName, "zh-CN"));

  let cumulative = 0;
  return grouped.map((item) => {
    cumulative += item.share;
    return {
      ...item,
      cumulativeShare: cumulative,
      abcClass: cumulative <= 0.7 ? "A" : cumulative <= 0.9 ? "B" : "C"
    };
  });
}

function buildChecks(input: {
  objectRows: CanonicalBomRow[];
  detailRows: CanonicalBomRow[];
  declaredMaterialRows: CanonicalBomRow[];
  overheadRows: CanonicalBomRow[];
  factoryPriceRows: CanonicalBomRow[];
  materialDetailTotal: number;
  declaredMaterialTotal: number;
  materialTotal: number;
  explicitOverhead: number;
  overheadTotal: number;
  factoryPrice: number;
  auditTotal: number;
  overheadWasDerived: boolean;
}): SingleBomCheck[] {
  const issueRows = input.objectRows.filter((row) => row.dataIssues.length > 0);
  const incompleteRows = input.objectRows.filter(
    (row) =>
      row.materialName.trim() &&
      !isSummaryCostRow(row) &&
      !isRollupCostRow(row.materialName, row.category) &&
      (row.quantity <= 0 || row.unitPrice <= 0 || row.amount <= 0)
  );
  const materialGap = input.declaredMaterialTotal - input.materialDetailTotal;
  const materialGapRate =
    input.declaredMaterialTotal > 0
      ? Math.abs(materialGap) / input.declaredMaterialTotal
      : 0;
  const totalGap =
    input.factoryPrice > 0
      ? input.factoryPrice - (input.materialTotal + input.overheadTotal)
      : 0;

  return [
    {
      id: "row-consistency",
      label: "金额计算",
      status: issueRows.length === 0 ? "good" : issueRows.length <= 2 ? "attention" : "risk",
      value: issueRows.length === 0 ? "计算正常" : `${issueRows.length} 行需要检查`,
      explanation: "检查每行的数量乘以单价，是否等于该行金额。",
      rows: issueRows
    },
    {
      id: "row-completeness",
      label: "物料信息",
      status: incompleteRows.length === 0 ? "good" : incompleteRows.length <= 2 ? "attention" : "risk",
      value: incompleteRows.length === 0 ? "信息完整" : `${incompleteRows.length} 行需要补充`,
      explanation: "检查物料是否填写了数量、单价和金额。",
      rows: incompleteRows
    },
    {
      id: "material-reconciliation",
      label: "材料合计",
      status:
        input.declaredMaterialTotal <= 0
          ? "attention"
          : materialGapRate <= 0.01
            ? "good"
            : materialGapRate <= 0.05
              ? "attention"
              : "risk",
      value:
        input.declaredMaterialTotal > 0
          ? `${formatSignedMoney(materialGap)}`
          : "表内没有填写材料合计",
      explanation:
        input.declaredMaterialTotal > 0
          ? `供应商填写的材料合计为 ${formatMoney(input.declaredMaterialTotal)}，系统根据物料明细计算为 ${formatMoney(input.materialDetailTotal)}。`
          : `系统已根据物料明细计算出 ${formatMoney(input.materialDetailTotal)}，但表内没有单独填写材料合计，建议向供应商确认。`,
      rows: [...input.declaredMaterialRows, ...input.detailRows]
    },
    {
      id: "overhead-source",
      label: "人工及其他费用",
      status: input.overheadTotal > 0 ? (input.overheadWasDerived ? "attention" : "good") : "attention",
      value: input.overheadTotal > 0 ? formatMoney(input.overheadTotal) : "表内没有填写",
      explanation: input.overheadWasDerived
        ? "表内没有单独填写这部分费用，当前金额由最终报价减去材料成本计算得出。"
        : input.explicitOverhead > 0
          ? "金额来自表内填写的人工、管理、利润、损耗或其他费用。"
          : "表内没有填写人工、管理、利润或其他费用，也无法根据最终报价计算。",
      rows: input.overheadRows
    },
    {
      id: "factory-reconciliation",
      label: "最终报价",
      status:
        input.factoryPrice <= 0
          ? "attention"
          : Math.abs(totalGap) <= Math.max(0.01, input.factoryPrice * 0.01)
            ? "good"
            : "risk",
      value: input.factoryPrice > 0 ? formatSignedMoney(totalGap) : "表内没有填写最终报价",
      explanation:
        input.factoryPrice > 0
          ? `供应商最终报价为 ${formatMoney(input.factoryPrice)}，材料与其他费用合计为 ${formatMoney(input.materialTotal + input.overheadTotal)}。`
          : `系统暂按材料和其他费用合计得到 ${formatMoney(input.auditTotal)}，建议补充供应商最终报价。`,
      rows: input.factoryPriceRows
    }
  ];
}

function buildInsights(input: {
  categories: SingleBomCategoryItem[];
  materials: SingleBomMaterialItem[];
  materialDetailTotal: number;
  declaredMaterialTotal: number;
  materialTotal: number;
  overheadTotal: number;
  auditTotal: number;
  overheadWasDerived: boolean;
  topFiveShare: number;
  issueCount: number;
}): SingleBomInsight[] {
  const largestCategory = input.categories[0];
  const materialGapRate =
    input.declaredMaterialTotal > 0
      ? Math.abs(input.declaredMaterialTotal - input.materialDetailTotal) / input.declaredMaterialTotal
      : 0;

  const insights: SingleBomInsight[] = [];
  if (input.declaredMaterialTotal <= 0 || materialGapRate > 0.01) {
    insights.push({
      id: "reconciliation",
      title: "材料汇总需核对",
      body:
        input.declaredMaterialTotal <= 0
          ? "表内未识别到独立材料成本合计，当前材料口径来自明细逐项加总。"
          : `表内材料合计与明细汇总相差 ${formatMoney(Math.abs(input.declaredMaterialTotal - input.materialDetailTotal))}，建议检查合并计价、小计重复或缺少金额的物料。`,
      tone: materialGapRate > 0.05 ? "risk" : "attention"
    });
  }
  if (input.issueCount > 0) {
    insights.push({
      id: "data-issues",
      title: "先处理数据异常",
      body: `当前识别到 ${input.issueCount} 个行级问题。建议先修正数量、单价和金额矛盾，再使用分析结果进行商务沟通。`,
      tone: "risk"
    });
  }
  if (largestCategory && largestCategory.share >= 0.15) {
    const categoryLead = input.materials.find((material) => material.category === largestCategory.category);
    const categoryAdvice = getMaterialNegotiationAdvice(
      categoryLead?.materialName ?? largestCategory.category,
      largestCategory.category
    );
    insights.push({
      id: "category-focus",
      title: `${largestCategory.category}是主要成本品类`,
      body: `金额 ${formatMoney(largestCategory.amount)}，占材料明细 ${formatPercent(largestCategory.share)}。如需继续降本，建议先从该品类展开；${categoryAdvice.singleAction}。`,
      tone: largestCategory.share >= 0.35 ? "attention" : "neutral"
    });
  }
  input.materials
    .filter((material) => material.share >= 0.1)
    .slice(0, 3)
    .forEach((material, index) => {
      const advice = getMaterialNegotiationAdvice(material.materialName, material.category);
      insights.push({
        id: `material-focus-${index + 1}`,
        title: `${material.materialName}值得进一步核验`,
        body: `金额 ${formatMoney(material.amount)}，占材料明细 ${formatPercent(material.share)}。它对整份报价影响较大，建议：${advice.singleAction}。`,
        tone: material.share >= 0.2 ? "attention" : "neutral"
      });
    });
  if (input.topFiveShare >= 0.7) {
    insights.push({
      id: "cost-concentration",
      title: "成本集中在少数物料",
      body: `前 5 项物料合计占材料成本 ${formatPercent(input.topFiveShare)}。核价时优先处理这些高金额项目，比逐项检查全部小额物料更有效。`,
      tone: "attention"
    });
  }
  const overheadShare = input.auditTotal > 0 ? input.overheadTotal / input.auditTotal : 0;
  if (input.overheadWasDerived || overheadShare >= 0.15) {
    insights.push({
      id: "cost-boundary",
      title: input.overheadWasDerived ? "其他费用来自系统反推" : "其他费用占比较高",
      body: `人工、管理、利润及附加费用为 ${formatMoney(input.overheadTotal)}，占核验总成本 ${formatPercent(overheadShare)}${input.overheadWasDerived ? "，表内没有单独填写该金额" : ""}。建议确认费用包含范围和计算基数。`,
      tone: "attention"
    });
  }
  if (insights.length === 0) {
    insights.push({
      id: "no-major-focus",
      title: "暂未发现需要优先深挖的成本项",
      body: "当前成本分布较均衡，也没有明显的数据问题。可以先查看金额明细，待发现高占比或异常项目后再进一步核验。",
      tone: "neutral"
    });
  }
  return insights;
}

function sumAmounts(rows: CanonicalBomRow[]): number {
  return rows.reduce((sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0), 0);
}

function pickLargestAmount(rows: CanonicalBomRow[]): number {
  const manualValues = rows.filter(isManualSummaryEntry).map((row) => row.amount).filter((amount) => amount > 0);
  if (manualValues.length > 0) return Math.max(...manualValues);
  return Math.max(0, ...rows.map((row) => row.amount).filter((amount) => amount > 0));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function formatMoney(value: number): string {
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function formatSignedMoney(value: number): string {
  if (Math.abs(value) < 0.005) return "0";
  return `${value > 0 ? "+" : "-"}${formatMoney(Math.abs(value))}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
