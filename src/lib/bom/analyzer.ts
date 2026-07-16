import { AnalysisReport, BomFileRecord, CanonicalBomRow, CostIssue, SupplierSummary } from "@/types/bom";

export function buildAnalysisReport(records: BomFileRecord[]): AnalysisReport {
  const supplierSummaries = summarizeSuppliers(records);
  const quoteRows = records.flatMap((record) => record.rows).filter((row) => row.kind === "supplier_quote");
  const historicalRows = records.flatMap((record) => record.rows).filter((row) => row.kind === "historical_bom");
  const issues: CostIssue[] = [];

  issues.push(...findDataConflictIssues(quoteRows));
  issues.push(...findPriceGapIssues(quoteRows));
  issues.push(...findMissingItemIssues(quoteRows, historicalRows));

  return {
    generatedAt: new Date().toISOString(),
    supplierSummaries,
    issues,
    reportMarkdown: renderMarkdown(supplierSummaries, issues)
  };
}

function findDataConflictIssues(rows: CanonicalBomRow[]): CostIssue[] {
  return rows
    .filter((row) => row.dataIssues?.length > 0)
    .map((row) => ({
      id: `data-${row.id}`,
      type: "data_conflict",
      severity: row.dataIssues.some((issue) => issue.type === "amount_mismatch") ? "medium" : "low",
      title: "BOM 行数据需要复核",
      detail: `${row.supplierName} 的 ${row.materialName || row.partNumber || "未命名物料"} 存在 ${row.dataIssues.length} 个数据问题。`,
      materialName: row.normalizedName || row.materialName,
      recommendedAction: "展开原始字段，复核数量、单价、金额和物料名称是否填写正确。"
    }));
}

function findPriceGapIssues(rows: CanonicalBomRow[]): CostIssue[] {
  const issues: CostIssue[] = [];
  const byMaterial = groupBy(
    rows.filter((row) => row.normalizedName && row.amount > 0),
    (row) => `${row.normalizedName}__${row.spec}__${row.unit || ""}`
  );

  byMaterial.forEach((materialRows) => {
    const supplierCount = new Set(materialRows.map((row) => row.supplierName)).size;
    if (supplierCount < 2) {
      return;
    }

    const amounts = materialRows.map((row) => row.amount);
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    if (min > 0 && max / min >= 1.25) {
      const sample = materialRows[0];
      issues.push({
        id: `price-${sample.normalizedName}-${sample.spec}-${sample.unit}`,
        type: "price_gap",
        severity: max / min >= 1.6 ? "high" : "medium",
        title: "供应商物料金额差异偏高",
        detail: `${sample.materialName || sample.normalizedName} 的最高报价 ${max.toFixed(2)}，最低报价 ${min.toFixed(2)}，差异 ${(
          max / min -
          1
        ).toLocaleString("zh-CN", { style: "percent" })}。`,
        materialName: sample.normalizedName || sample.materialName,
        recommendedAction: "优先复核用量、规格、单位、币种、税费口径和 MOQ 是否一致，再向高金额供应商发起议价。"
      });
    }
  });

  return issues;
}

function findMissingItemIssues(quoteRows: CanonicalBomRow[], historicalRows: CanonicalBomRow[]): CostIssue[] {
  if (historicalRows.length === 0) {
    return [];
  }

  const quoteMaterials = new Set(quoteRows.map((row) => row.normalizedName).filter(Boolean));
  const missing = Array.from(new Set(historicalRows.map((row) => row.normalizedName).filter(Boolean))).filter(
    (materialName) => !quoteMaterials.has(materialName)
  );

  return missing.slice(0, 20).map((materialName) => ({
    id: `missing-${materialName}`,
    type: "missing_item",
    severity: "high",
    title: "历史 BOM 物料在当前报价中缺项",
    detail: `${materialName} 出现在历史 BOM 中，但当前供应商报价未覆盖。`,
    materialName,
    recommendedAction: "确认是否设计变更、替代料变更或供应商漏报，避免后续补采风险。"
  }));
}

function summarizeSuppliers(records: BomFileRecord[]): SupplierSummary[] {
  const grouped = groupBy(records, (record) => `${record.supplierName}__${record.kind}`);
  return Array.from(grouped.values()).map((group) => ({
    supplierName: group[0].supplierName,
    kind: group[0].kind,
    fileCount: group.length,
    itemCount: group.reduce((sum, record) => sum + record.rowCount, 0),
    totalAmount: group.reduce((sum, record) => sum + record.rows.reduce((rowSum, row) => rowSum + row.amount, 0), 0)
  }));
}

function renderMarkdown(summaries: SupplierSummary[], issues: CostIssue[]): string {
  const totalRows = summaries.reduce((sum, item) => sum + item.itemCount, 0);
  const totalAmount = summaries.reduce((sum, item) => sum + item.totalAmount, 0);
  const highIssues = issues.filter((issue) => issue.severity === "high").length;

  return [
    "## 成本核验摘要",
    `本次共解析 ${totalRows} 行 BOM/报价数据，当前样本总金额约 ${totalAmount.toFixed(2)}。`,
    `系统识别 ${issues.length} 个待复核事项，其中高优先级 ${highIssues} 个。`,
    "",
    "## 建议动作",
    "- 优先检查数据异常行，确保数量、单价、金额口径一致。",
    "- 对同规格同单位物料进行供应商金额对比。",
    "- 对历史 BOM 中存在但当前报价缺失的物料发起补报。"
  ].join("\n");
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  return items.reduce((map, item) => {
    const key = getKey(item);
    map.set(key, [...(map.get(key) ?? []), item]);
    return map;
  }, new Map<string, T[]>());
}
