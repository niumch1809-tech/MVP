import type { CanonicalBomRow } from "@/types/bom";
import { buildCostComparison, getComparisonObjectLabel, normalizeCostCategory } from "./cost-comparison";
import { isRollupCostRow, isSummaryCostItem } from "./normalize";

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
      !isRollupCostRow(row.materialName, row.category)
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

function isMaterialDetailRow(row: CanonicalBomRow): boolean {
  const category = effectiveCategory(row);
  return (
    row.amount > 0 &&
    !["材料成本合计", "人工", "人工/管理/利润", "出厂价"].includes(category) &&
    !isSummaryCostItem(row.materialName, row.category) &&
    !isRollupCostRow(row.materialName, row.category)
  );
}

function effectiveCategory(row: CanonicalBomRow): string {
  return row.manualCategory?.trim() || normalizeCostCategory(row.category, row.materialName);
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
      !isSummaryCostItem(row.materialName, row.category) &&
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
  const largestMaterial = input.materials[0];
  const materialGapRate =
    input.declaredMaterialTotal > 0
      ? Math.abs(input.declaredMaterialTotal - input.materialDetailTotal) / input.declaredMaterialTotal
      : 0;

  const insights: SingleBomInsight[] = [];
  if (largestCategory) {
    insights.push({
      id: "category-focus",
      title: "主要成本品类",
      body: `${largestCategory.category}金额 ${formatMoney(largestCategory.amount)}，占材料明细 ${formatPercent(largestCategory.share)}，是当前优先核价品类。`,
      tone: largestCategory.share >= 0.5 ? "attention" : "neutral"
    });
  }
  if (largestMaterial) {
    insights.push({
      id: "material-focus",
      title: "关键成本物料",
      body: `${largestMaterial.materialName}金额 ${formatMoney(largestMaterial.amount)}，占材料明细 ${formatPercent(largestMaterial.share)}；前 5 项合计占 ${formatPercent(input.topFiveShare)}。`,
      tone: input.topFiveShare >= 0.7 ? "attention" : "neutral"
    });
  }
  insights.push({
    id: "cost-boundary",
    title: "报价口径",
    body: `核验总成本 ${formatMoney(input.auditTotal)}，其中材料成本 ${formatMoney(input.materialTotal)}，人工/管理/利润及附加费用 ${formatMoney(input.overheadTotal)}${input.overheadWasDerived ? "（反推）" : ""}。`,
    tone: input.overheadWasDerived ? "attention" : "neutral"
  });
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
  return insights;
}

function sumAmounts(rows: CanonicalBomRow[]): number {
  return rows.reduce((sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0), 0);
}

function pickLargestAmount(rows: CanonicalBomRow[]): number {
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
