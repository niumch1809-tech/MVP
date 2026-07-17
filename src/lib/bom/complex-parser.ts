import * as XLSX from "xlsx";
import { BomDataIssue, BomFileKind, BomFieldMapping, BomFileRecord, CanonicalBomRow } from "@/types/bom";
import { isKnownCategoryLabel } from "./material-knowledge";
import { isAdministrativeStampText, isSectionTitleText, isSubtotalText } from "./row-classifier";
import { analyzeSheetStructure, ComplexSheetBlock, ComplexSheetStructure } from "./sheet-structure";
import {
  hasValue,
  inferQuantityFromText,
  inferUnitPriceFromText,
  isRollupCostRow,
  isSummaryCostItem,
  normalizeBomCategory,
  normalizeMaterialName,
  normalizeUnit,
  parseMaterialDescriptor,
  toNumber
} from "./normalize";
import { findStructuredQuoteTitle, parseQuoteIdentity } from "./quote-identity";

type ComplexParseInput = {
  fileId: string;
  fileName: string;
  productName: string;
  supplierName: string;
  kind: BomFileKind;
};

type ExtractedComplexRowFields = {
  category: string;
  categorySource: string;
  materialName: string;
  materialSource: string;
  spec: string;
  specSource: string;
  remark: string;
  quantityRaw: unknown;
  unitPriceRaw: unknown;
  amountRaw: unknown;
};

export type ComplexParseResult = {
  shouldUse: boolean;
  record?: BomFileRecord;
  warnings: string[];
};

const GENERIC_SHEET_NAMES = new Set(["sheet1", "sheet2", "sheet3", "工作表1", "工作表2", "工作表3", "报价", "bom"]);

export function parseComplexBomWorkbook(workbook: XLSX.WorkBook, input: ComplexParseInput): ComplexParseResult {
  const sheetNames = workbook.SheetNames.filter((sheetName) => !isTemplateOutputSheetName(sheetName));
  const structures = sheetNames.map((sheetName) => analyzeSheetStructure(workbook, sheetName, workbook.SheetNames.indexOf(sheetName)));
  const complexSheets = structures.filter((structure) => structure.isComplex && structure.blocks.length > 0);
  const shouldUse = shouldUseComplexParser(structures);

  if (!shouldUse || complexSheets.length === 0) {
    return { shouldUse: false, warnings: buildStructureWarnings(structures) };
  }

  const hasMultipleSheets = complexSheets.length > 1;
  const rows = complexSheets.flatMap((structure) => parseComplexSheetRows(input, structure, hasMultipleSheets));
  if (rows.length === 0) {
    return {
      shouldUse: false,
      warnings: [...buildStructureWarnings(structures), "复杂 BOM 解析器未能抽取出有效物料行，已回退标准解析。"]
    };
  }

  const parseWarnings = [
    "已启用复杂 BOM 解析器：输入表先按区块、表头、合并单元格和行类型拆解，再转换为标准 BOM 行。",
    ...buildStructureWarnings(complexSheets),
    ...buildExtractionWarnings(complexSheets)
  ];

  return {
    shouldUse: true,
    warnings: parseWarnings,
    record: {
      id: input.fileId,
      fileName: input.fileName,
      productName: rows.find((row) => row.productName)?.productName ?? input.productName,
      supplierName: hasMultipleSheets ? `${input.supplierName}（复杂多工作表）` : rows[0]?.supplierName ?? input.supplierName,
      kind: input.kind,
      uploadedAt: new Date().toISOString(),
      sheetName: complexSheets.map((sheet) => sheet.sheetName).join(" / "),
      rowCount: rows.length,
      fieldMapping: firstFieldMapping(complexSheets),
      parseWarnings,
      rows
    }
  };
}

function shouldUseComplexParser(structures: ComplexSheetStructure[]): boolean {
  const nonEmptySheets = structures.filter((structure) => structure.rowCount > 0);
  if (nonEmptySheets.length === 0) return false;
  return nonEmptySheets.some((structure) => {
    const strongSignals = [
      structure.sectionRows.length >= 2,
      structure.repeatedHeaderRows.length >= 1,
      structure.blocks.length >= 2,
      structure.mergeCount >= 6,
      structure.subtotalRows.length >= 2,
      structure.clearHeaderRows.length === 0
    ].filter(Boolean).length;
    return strongSignals >= 2;
  });
}

function parseComplexSheetRows(input: ComplexParseInput, structure: ComplexSheetStructure, hasMultipleSheets: boolean): CanonicalBomRow[] {
  return structure.blocks.flatMap((block, blockIndex) => parseBlockRows(input, structure, block, blockIndex, hasMultipleSheets));
}

function parseBlockRows(
  input: ComplexParseInput,
  structure: ComplexSheetStructure,
  block: ComplexSheetBlock,
  blockIndex: number,
  hasMultipleSheets: boolean
): CanonicalBomRow[] {
  const rows: CanonicalBomRow[] = [];
  let currentCategory = normalizeBomCategory(block.title, "");

  block.rows.forEach((row) => {
    if (row.type === "header" || row.type === "blank") return;
    if (row.type === "subtotal") {
      const summaryRow = toComplexSummaryRow({
        input,
        structure,
        block,
        blockIndex,
        row,
        source: rowFromCells(block.headers, row.cells),
        hasMultipleSheets
      });
      if (summaryRow) rows.push(summaryRow);
      return;
    }
    if (row.type === "section_title") {
      currentCategory = normalizeBomCategory(getRowText(row.cells), "");
      return;
    }
    const source = rowFromCells(block.headers, row.cells);
    const summaryRow = toComplexSummaryRow({
      input,
      structure,
      block,
      blockIndex,
      row,
      source,
      hasMultipleSheets
    });
    if (summaryRow) {
      rows.push(summaryRow);
      return;
    }
    const extracted = extractComplexRowFields(block, source, row.cells);
    if (extracted.category) currentCategory = extracted.category;
    const canonicalRow = toComplexCanonicalRow({
      input,
      structure,
      block,
      blockIndex,
      row,
      source,
      extracted,
      category: extracted.category || currentCategory,
      hasMultipleSheets
    });

    if (canonicalRow) rows.push(canonicalRow);
  });

  return dedupeRepeatedMergedAmounts(rows);
}

function toComplexCanonicalRow({
  input,
  structure,
  block,
  blockIndex,
  row,
  source,
  extracted,
  category,
  hasMultipleSheets
}: {
  input: ComplexParseInput;
  structure: ComplexSheetStructure;
  block: ComplexSheetBlock;
  blockIndex: number;
  row: { rowIndex: number; type: string; reason: string };
  source: Record<string, unknown>;
  extracted: ExtractedComplexRowFields;
  category: string;
  hasMultipleSheets: boolean;
}): CanonicalBomRow | null {
  const fields = block.fieldMapping;
  const rawMaterialName = extracted.materialName;
  const rawSpec = extracted.spec;
  const rawRemark = extracted.remark;
  const quantityRaw = extracted.quantityRaw;
  const unitPriceRaw = extracted.unitPriceRaw;
  const amountRaw = extracted.amountRaw;
  const descriptor = parseMaterialDescriptor(rawMaterialName, rawSpec);
  const fallbackMaterialName = descriptor.materialName || (rawSpec && !rawMaterialName ? rawSpec : "");
  const isSummaryRow = isSummaryCostItem(fallbackMaterialName, category) || isRollupCostRow(fallbackMaterialName, category);
  if (!fallbackMaterialName || isSummaryRow) return null;

  const inferredQuantity = inferQuantityFromText(rawMaterialName, rawSpec, rawRemark, quantityRaw);
  const quantity = toNumber(quantityRaw) || inferredQuantity.quantity;
  const unitPrice = toNumber(unitPriceRaw) || inferUnitPriceFromText(rawMaterialName, rawSpec, rawRemark, unitPriceRaw, amountRaw);
  const explicitAmount = toNumber(amountRaw);
  const calculatedAmount = quantity * unitPrice;
  const shouldCalculateAmount = !hasValue(amountRaw) && quantity > 0 && unitPrice > 0;
  const amount = shouldCalculateAmount ? calculatedAmount : explicitAmount;
  const identity = parseQuoteIdentity(resolveQuoteName(input, structure, hasMultipleSheets), input.supplierName, input.productName);

  return {
    id: `${input.fileId}-complex-s${structure.sheetIndex + 1}-b${blockIndex + 1}-r${row.rowIndex + 1}`,
    sourceFileId: input.fileId,
    sourceFileName: input.fileName,
    sheetName: structure.sheetName,
    rowNumber: row.rowIndex + 1,
    productName: identity.productName,
    productModel: identity.productModel,
    productColor: identity.productColor,
    quoteName: identity.quoteName,
    supplierName: identity.supplierName,
    kind: input.kind,
    partNumber: getString(source, fields.partNumber),
    materialName: descriptor.materialName || fallbackMaterialName,
    normalizedName: descriptor.normalizedName || normalizeMaterialName(fallbackMaterialName),
    spec: descriptor.spec || rawSpec,
    category,
    unit: normalizeUnit(getString(source, fields.unit)) || inferredQuantity.unit,
    quantity,
    unitPrice,
    amount,
    totalPrice: amount,
    currency: getString(source, fields.currency) || "CNY",
    remark: rawRemark,
    isAmountCalculated: shouldCalculateAmount,
    dataIssues: buildComplexDataIssues({ materialName: fallbackMaterialName, quantity, unitPrice, explicitAmount, calculatedAmount, hasExplicitAmount: hasValue(amountRaw) }),
    originalFields: {
      ...source,
      解析器: "复杂BOM解析器",
      来源区块: block.title,
      行类型: row.type,
      行类型原因: row.reason,
      表头行: block.headerRowIndex + 1,
      品类来源: extracted.categorySource,
      物料来源: extracted.materialSource,
      规格来源: extracted.specSource
    },
    raw: source
  };
}

function toComplexSummaryRow({
  input,
  structure,
  block,
  blockIndex,
  row,
  source,
  hasMultipleSheets
}: {
  input: ComplexParseInput;
  structure: ComplexSheetStructure;
  block: ComplexSheetBlock;
  blockIndex: number;
  row: { rowIndex: number; cells: unknown[]; type: string; reason: string };
  source: Record<string, unknown>;
  hasMultipleSheets: boolean;
}): CanonicalBomRow | null {
  const label = normalizeSummaryLabel(getRowText(row.cells));
  const amount = pickSummaryAmount(row.cells);
  if (!label || amount <= 0) return null;

  const identity = parseQuoteIdentity(resolveQuoteName(input, structure, hasMultipleSheets), input.supplierName, input.productName);
  const category = normalizeBomCategory("", label);

  return {
    id: `${input.fileId}-complex-s${structure.sheetIndex + 1}-b${blockIndex + 1}-summary-r${row.rowIndex + 1}`,
    sourceFileId: input.fileId,
    sourceFileName: input.fileName,
    sheetName: structure.sheetName,
    rowNumber: row.rowIndex + 1,
    productName: identity.productName,
    productModel: identity.productModel,
    productColor: identity.productColor,
    quoteName: identity.quoteName,
    supplierName: identity.supplierName,
    kind: input.kind,
    partNumber: "",
    materialName: label,
    normalizedName: normalizeMaterialName(label),
    spec: "",
    category,
    unit: "",
    quantity: 1,
    unitPrice: amount,
    amount,
    totalPrice: amount,
    currency: getString(source, block.fieldMapping.currency) || "CNY",
    remark: "",
    isAmountCalculated: false,
    dataIssues: [],
    originalFields: {
      ...source,
      parser: "complex-bom",
      rowRole: "summary",
      sourceBlock: block.title,
      summaryLabel: label,
      summaryRule: "Subtotal/factory/overhead row is preserved for audit totals but excluded from material-detail comparison."
    },
    raw: source
  };
}

function dedupeRepeatedMergedAmounts(rows: CanonicalBomRow[]): CanonicalBomRow[] {
  const result: CanonicalBomRow[] = [];
  let start = 0;

  while (start < rows.length) {
    const base = rows[start];
    let end = start + 1;
    while (end < rows.length && shouldTreatAsMergedAmountDuplicate(base, rows[end])) {
      end += 1;
    }

    const group = rows.slice(start, end);
    result.push(group.length > 1 ? collapseMergedAmountGroup(group) : base);
    start = end;
  }

  return result;
}

function collapseMergedAmountGroup(group: CanonicalBomRow[]): CanonicalBomRow {
  const base = group[0];
  const materialNames = uniqueText(group.map((row) => row.materialName));
  const specs = uniqueText(group.flatMap((row) => [row.materialName, row.spec].filter(Boolean)));
  const groupId = `${base.sourceFileId}-${base.sheetName}-${base.rowNumber}-${group.length}`;
  const groupName = `${base.category && base.category !== "其他" ? base.category : "合并"}物料组`;

  return {
    ...base,
    id: `${base.id}-merged-group`,
    materialName: groupName,
    normalizedName: normalizeMaterialName(groupName),
    spec: specs.join(" / "),
    quantity: 1,
    unitPrice: base.amount,
    amount: base.amount,
    totalPrice: base.amount,
    isAmountCalculated: false,
    dataIssues: [],
    originalFields: {
      ...base.originalFields,
      mergedAmountGroup: groupId,
      mergedAmountGroupSize: group.length,
      mergedAmountPolicy: "collapsed-to-one-row",
      mergedMaterialNames: materialNames.join(" / "),
      mergedSourceRows: group.map((row) => row.rowNumber).join(", ")
    },
    raw: {
      ...base.raw,
      mergedMaterialNames: materialNames.join(" / ")
    }
  };
}

function shouldTreatAsMergedAmountDuplicate(previous: CanonicalBomRow, current: CanonicalBomRow): boolean {
  if (previous.amount <= 0 || current.amount <= 0) return false;
  if (Math.abs(previous.amount - current.amount) > 0.0001) return false;
  if (previous.supplierName !== current.supplierName || previous.sheetName !== current.sheetName) return false;
  if (previous.category !== current.category) return false;
  if (isSummaryCostItem(previous.materialName, previous.category) || isSummaryCostItem(current.materialName, current.category)) return false;
  const previousHasReliablePrice = previous.quantity > 0 && previous.unitPrice > 0 && Math.abs(previous.quantity * previous.unitPrice - previous.amount) <= Math.max(0.01, previous.amount * 0.02);
  const currentHasReliablePrice = current.quantity > 0 && current.unitPrice > 0 && Math.abs(current.quantity * current.unitPrice - current.amount) <= Math.max(0.01, current.amount * 0.02);
  return !previousHasReliablePrice || !currentHasReliablePrice;
}

function uniqueText(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeSummaryLabel(value: string): string {
  const text = value.trim();
  if (!text) return "";
  if (/出厂价|工厂价|factory/i.test(text)) return "出厂价";
  if (/核验总成本|最终合计|最终总计|总报价/i.test(text)) return "出厂价";
  if (/人工|管理|利润|损耗|杂费|附加费|费用|overhead|profit|labor/i.test(text)) return "人工/管理/利润";
  if (/材料成本|物料成本|原材料成本|材料合计|物料合计|bom合计|成本合计|部分成本|小计|合计|总计|subtotal/i.test(text)) return "材料成本合计";
  return "";
}

function pickSummaryAmount(cells: unknown[]): number {
  const numbers = cells.map((cell) => toNumber(cell)).filter((value) => value > 0);
  if (numbers.length === 0) return 0;
  return numbers[numbers.length - 1];
}

function extractComplexRowFields(block: ComplexSheetBlock, source: Record<string, unknown>, cells: unknown[]): ExtractedComplexRowFields {
  const fields = block.fieldMapping;
  const rawCategory = getString(source, fields.category);
  const rawMaterial = getString(source, fields.materialName);
  const rawSpec = getString(source, fields.spec);
  const rawRemark = getString(source, fields.remark);
  const category = isLikelyCategoryLabel(rawCategory) ? normalizeBomCategory(rawCategory, rawMaterial) : "";
  let materialName = isUsableMaterialLabel(rawMaterial) ? rawMaterial : "";
  let materialSource = materialName ? String(fields.materialName ?? "物料列") : "";

  if (!materialName && rawCategory && !isLikelyCategoryLabel(rawCategory) && isUsableMaterialLabel(rawCategory)) {
    materialName = rawCategory;
    materialSource = String(fields.category ?? "品类列纠偏");
  }

  if (!materialName) {
    const inferred = inferMaterialFromCells(block, cells);
    materialName = inferred.value;
    materialSource = inferred.source;
  }

  const spec = isLikelySpecValue(rawSpec, materialName) ? rawSpec : inferSpecFromCells(block, cells, materialName);

  return {
    category,
    categorySource: category ? String(fields.category ?? "品类列") : "区块标题继承",
    materialName,
    materialSource,
    spec,
    specSource: rawSpec ? String(fields.spec ?? "规格列") : "行内推断",
    remark: rawRemark,
    quantityRaw: getValue(source, fields.quantity),
    unitPriceRaw: getValue(source, fields.unitPrice),
    amountRaw: getValue(source, fields.amount)
  };
}

function inferMaterialFromCells(block: ComplexSheetBlock, cells: unknown[]): { value: string; source: string } {
  const fieldIndexes = getFieldIndexes(block);
  const ignored = new Set([
    fieldIndexes.quantity,
    fieldIndexes.unitPrice,
    fieldIndexes.amount,
    fieldIndexes.unit,
    fieldIndexes.remark,
    fieldIndexes.currency,
    fieldIndexes.partNumber
  ].filter((index): index is number => typeof index === "number"));

  const candidates = cells
    .map((cell, index) => ({ index, value: String(cell ?? "").trim(), header: block.headers[index] ?? `第${index + 1}列` }))
    .filter((item) => item.value && !ignored.has(item.index))
    .filter((item) => {
      if (toNumber(item.value) > 0) return false;
      if (isSubtotalText(item.value) || isSectionTitleText(item.value)) return false;
      if (item.index === fieldIndexes.category && isLikelyCategoryLabel(item.value)) return false;
      return isUsableMaterialLabel(item.value);
    })
    .sort((a, b) => scoreMaterialCandidate(b.value, b.index, fieldIndexes) - scoreMaterialCandidate(a.value, a.index, fieldIndexes));

  const best = candidates[0];
  return best ? { value: best.value, source: best.header } : { value: "", source: "未识别" };
}

function inferSpecFromCells(block: ComplexSheetBlock, cells: unknown[], materialName: string): string {
  const fieldIndexes = getFieldIndexes(block);
  const explicitSpecIndex = fieldIndexes.spec;
  if (typeof explicitSpecIndex === "number") {
    const explicit = String(cells[explicitSpecIndex] ?? "").trim();
    if (isLikelySpecValue(explicit, materialName)) return explicit;
  }

  return cells
    .map((cell, index) => ({ index, value: String(cell ?? "").trim() }))
    .filter((item) => item.value && item.value !== materialName)
    .filter((item) => item.index !== fieldIndexes.category && item.index !== fieldIndexes.materialName)
    .filter((item) => toNumber(item.value) === 0 && isLikelySpecValue(item.value, materialName))
    .map((item) => item.value)
    .slice(0, 2)
    .join(" / ");
}

function getFieldIndexes(block: ComplexSheetBlock): Partial<Record<keyof BomFieldMapping, number>> {
  const result: Partial<Record<keyof BomFieldMapping, number>> = {};
  (Object.entries(block.fieldMapping) as Array<[keyof BomFieldMapping, string]>).forEach(([field, header]) => {
    result[field] = block.headers.indexOf(header);
  });
  return result;
}

function isLikelyCategoryLabel(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (isAdministrativeStampText(text)) return false;
  if (isSubtotalText(text)) return false;
  if (isKnownCategoryLabel(text)) return true;
  if (isSectionTitleText(text)) return true;
  if (text.length > 12) return false;
  return /^(结构件|电子料|光源|驱动\/控制器|线材|包装|人工|表面处理|模具\/治具|物流\/损耗|五金|杂项|塑胶|灯体|配光|包装袋|五金包|说明书|灯盘组|叶片组|吊钟组|吊杆组|其他)$/.test(text);
}

function isUsableMaterialLabel(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (isAdministrativeStampText(text)) return false;
  if (isSubtotalText(text) || isSectionTitleText(text)) return false;
  if (/^(物料|物料名称|材料名称|名称|规格|规格描述|单位|数量|单价|小计|合计|备注|编制|审核|批准|审批|复核|核准|日期)$/.test(text)) return false;
  return /[\p{Script=Han}a-zA-Z]/u.test(text);
}

function isLikelySpecValue(value: string, materialName: string): boolean {
  const text = value.trim();
  if (!text || text === materialName) return false;
  if (isSubtotalText(text) || isSectionTitleText(text)) return false;
  if (/^(单位|数量|单价|小计|合计|备注)$/.test(text)) return false;
  return /(\d|mm|cm|m\b|w\b|v\b|k\b|pcs|色|白|黑|金|银|塑料|铝|铁|铜|pc|abs|pet|pe|po|规格|型号)/i.test(text) || text.length > 8;
}

function scoreMaterialCandidate(value: string, index: number, fieldIndexes: Partial<Record<keyof BomFieldMapping, number>>): number {
  let score = 0;
  if (index === fieldIndexes.materialName) score += 30;
  if (index === fieldIndexes.category) score -= 10;
  if (/[\p{Script=Han}a-zA-Z]/u.test(value)) score += 8;
  if (/\d/.test(value)) score -= 2;
  if (value.length >= 2 && value.length <= 18) score += 4;
  if (value.length > 30) score -= 6;
  return score;
}

function buildComplexDataIssues(input: {
  materialName: string;
  quantity: number;
  unitPrice: number;
  explicitAmount: number;
  calculatedAmount: number;
  hasExplicitAmount: boolean;
}): BomDataIssue[] {
  const issues: BomDataIssue[] = [];
  if (!input.materialName) issues.push({ type: "missing_required_field", message: "复杂 BOM 行缺少物料名称。" });
  if (input.quantity <= 0) issues.push({ type: "missing_required_field", message: "复杂 BOM 行数量为空或小于等于 0。" });
  if (input.unitPrice <= 0) issues.push({ type: "missing_required_field", message: "复杂 BOM 行单价为空或小于等于 0。" });
  if (input.hasExplicitAmount && input.quantity > 0 && input.unitPrice > 0) {
    const tolerance = Math.max(0.01, Math.abs(input.calculatedAmount) * 0.02);
    if (Math.abs(input.explicitAmount - input.calculatedAmount) > tolerance) {
      issues.push({
        type: "amount_mismatch",
        message: "复杂 BOM 行金额与数量 x 单价不一致。",
        expected: roundMoney(input.calculatedAmount),
        actual: roundMoney(input.explicitAmount)
      });
    }
  }
  return issues;
}

function buildStructureWarnings(structures: ComplexSheetStructure[]): string[] {
  return structures.flatMap((structure) => [
    `${structure.sheetName}：${structure.clearHeaderRows.length === 1 ? "识别到 1 个清晰表头" : `识别到 ${structure.clearHeaderRows.length} 个表头候选`}；${structure.sectionRows.length} 个分段标题；${structure.repeatedHeaderRows.length} 个重复表头；${structure.mergeCount} 个合并单元格；${structure.subtotalRows.length} 个小计/合计行。`,
    ...structure.reasons.map((reason) => `${structure.sheetName}：${reason}`)
  ]);
}

function buildExtractionWarnings(structures: ComplexSheetStructure[]): string[] {
  return structures.flatMap((structure) => {
    const blockLines = structure.blocks.map((block) => {
      const materialRows = block.rows.filter((row) => row.type === "material").length;
      const subtotalRows = block.rows.filter((row) => row.type === "subtotal").length;
      const unknownRows = block.rows.filter((row) => row.type === "unknown").length;
      const mapped = Object.entries(block.fieldMapping).map(([field, header]) => `${field}:${header}`).join("，") || "无字段映射";
      return `${structure.sheetName} / ${block.title}：物料候选 ${materialRows} 行；排除小计 ${subtotalRows} 行；无法识别 ${unknownRows} 行；字段映射 ${mapped}。`;
    });
    return [`${structure.sheetName}：识别到 ${structure.blocks.length} 个区块。`, ...blockLines];
  });
}

function firstFieldMapping(structures: ComplexSheetStructure[]): BomFieldMapping {
  return structures.flatMap((structure) => structure.blocks.map((block) => block.fieldMapping)).find((mapping) => Object.keys(mapping).length > 0) ?? {};
}

function resolveQuoteName(input: ComplexParseInput, structure: ComplexSheetStructure, hasMultipleSheets: boolean): string {
  const sheetName = structure.sheetName.trim();
  const firstHeaderRow = Math.min(...structure.clearHeaderRows);
  const quoteTitle = Number.isFinite(firstHeaderRow) ? findStructuredQuoteTitle(structure.matrix, firstHeaderRow) : "";
  if (quoteTitle) return quoteTitle;
  if (!hasMultipleSheets) return input.supplierName;
  if (sheetName && !GENERIC_SHEET_NAMES.has(sheetName.toLowerCase())) return sheetName;
  return `${input.supplierName}-报价${structure.sheetIndex + 1}`;
}

function getRowText(cells: unknown[]): string {
  return Array.from(new Set(cells.map((cell) => String(cell ?? "").trim()).filter(Boolean))).join(" ");
}

function rowFromCells(headers: string[], cells: unknown[]): Record<string, unknown> {
  return headers.reduce<Record<string, unknown>>((row, header, index) => {
    row[header] = cells[index] ?? "";
    return row;
  }, {});
}

function getValue(row: Record<string, unknown>, key?: string): unknown {
  return key ? row[key] : undefined;
}

function getString(row: Record<string, unknown>, key?: string): string {
  return String(getValue(row, key) ?? "").trim();
}

function isTemplateOutputSheetName(sheetName: string): boolean {
  return sheetName.trim() === "输出";
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
