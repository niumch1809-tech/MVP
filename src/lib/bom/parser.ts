import * as XLSX from "xlsx";
import { BomDataIssue, BomFileKind, BomFieldMapping, BomFileRecord, CanonicalBomRow } from "@/types/bom";
import { parseComplexBomWorkbook } from "./complex-parser";
import { mapHeader, scoreHeaderRow } from "./field-map";
import {
  hasValue,
  inferQuantityFromText,
  inferUnitPriceFromText,
  isSummaryCostItem,
  normalizeMaterialName,
  normalizeUnit,
  parseMaterialDescriptor,
  toNumber
} from "./normalize";

type ParseInput = {
  fileId: string;
  fileName: string;
  productName: string;
  supplierName: string;
  kind: BomFileKind;
  buffer: Buffer;
  extension?: string;
};

type ParsedSheet = {
  sheetName: string;
  sheetIndex: number;
  headerRowIndex: number;
  headers: string[];
  rows: Record<string, unknown>[];
  fieldMapping: BomFieldMapping;
  warnings: string[];
};

type QuoteIdentity = {
  supplierName: string;
  productName: string;
  productModel: string;
  productColor: string;
  quoteName: string;
};

const REQUIRED_FIELDS: Array<keyof BomFieldMapping> = ["materialName", "quantity", "unitPrice"];

const GENERIC_SHEET_NAMES = new Set(["sheet1", "sheet2", "sheet3", "工作表1", "工作表2", "工作表3", "报价", "bom"]);

export function parseBomWorkbook(input: ParseInput): BomFileRecord {
  const workbook = XLSX.read(input.buffer, {
    type: "buffer",
    cellDates: false,
    codepage: input.extension === "csv" ? 65001 : undefined
  });

  if (workbook.SheetNames.length === 0) {
    throw new Error("文件中没有可读取的工作表。");
  }

  const complexResult = parseComplexBomWorkbook(workbook, input);
  if (complexResult.shouldUse && complexResult.record) {
    return complexResult.record;
  }

  const parsedSheets = readWorkbookSheets(workbook);
  if (parsedSheets.length === 0) {
    throw new Error("文件中没有识别到可解析的 BOM 工作表。");
  }

  const hasMultipleSheets = parsedSheets.length > 1;
  const rows = parsedSheets.flatMap((parsedSheet) => {
    const sheetInput = {
      ...input,
      supplierName: resolveQuoteName(input, parsedSheet, hasMultipleSheets)
    };
    return isWideSupplierSheet(parsedSheet)
      ? parseWideSupplierRows(sheetInput, parsedSheet, hasMultipleSheets)
      : parsedSheet.rows
          .map((row, index) => toCanonicalRow(sheetInput, parsedSheet, row, index))
          .filter((row) => row.materialName || row.partNumber || row.quantity || row.unitPrice || row.amount);
  });

  const parseWarnings = [
    ...(hasMultipleSheets ? [`识别到 ${parsedSheets.length} 个有效工作表，已按工作表名称拆分为不同报价对象。`] : []),
    ...parsedSheets.flatMap((parsedSheet) => {
      const missingRequired = REQUIRED_FIELDS.filter((field) => !parsedSheet.fieldMapping[field]);
      return [
        ...parsedSheet.warnings.map((warning) => `${parsedSheet.sheetName}：${warning}`),
        ...(isWideSupplierSheet(parsedSheet) ? [`${parsedSheet.sheetName}：识别为多供应商横向报价表，已按供应商列展开为 BOM 明细。`] : []),
        ...(isWideSupplierSheet(parsedSheet) ? [] : missingRequired.map((field) => `${parsedSheet.sheetName}：未识别到关键字段：${field}`))
      ];
    })
  ];

  return {
    id: input.fileId,
    fileName: input.fileName,
    productName: input.productName,
    supplierName: hasMultipleSheets ? `${input.supplierName}（多工作表）` : rows[0]?.supplierName ?? input.supplierName,
    kind: input.kind,
    uploadedAt: new Date().toISOString(),
    sheetName: parsedSheets.map((sheet) => sheet.sheetName).join(" / "),
    rowCount: rows.length,
    fieldMapping: parsedSheets[0].fieldMapping,
    parseWarnings,
    rows
  };
}

function resolveQuoteName(input: ParseInput, parsedSheet: ParsedSheet, hasMultipleSheets: boolean): string {
  const sheetName = parsedSheet.sheetName.trim();
  if (!hasMultipleSheets) {
    return input.supplierName;
  }

  if (sheetName && !GENERIC_SHEET_NAMES.has(sheetName.toLowerCase())) {
    return sheetName;
  }

  return `${input.supplierName}-报价${parsedSheet.sheetIndex + 1}`;
}

function isWideSupplierSheet(parsedSheet: ParsedSheet): boolean {
  const fields = parsedSheet.fieldMapping;
  const supplierColumns = parsedSheet.headers.filter(
    (header) =>
      header !== fields.category &&
      header !== fields.materialName &&
      header !== fields.spec &&
      header !== fields.remark &&
      header !== fields.unit &&
      header !== fields.quantity &&
      header !== fields.unitPrice &&
      header !== fields.amount &&
      header !== fields.currency &&
      header !== fields.partNumber
  );

  return Boolean(fields.category && fields.materialName && !fields.unitPrice && !fields.amount && supplierColumns.length >= 1);
}

function parseWideSupplierRows(input: ParseInput, parsedSheet: ParsedSheet, hasMultipleSheets = false): CanonicalBomRow[] {
  const fields = parsedSheet.fieldMapping;
  const supplierColumns = parsedSheet.headers.filter(
    (header) => header !== fields.category && header !== fields.materialName && header !== fields.remark
  );
  const rows: CanonicalBomRow[] = [];
  let currentCategory = "";

  parsedSheet.rows.forEach((row, rowIndex) => {
    const category = getString(row, fields.category);
    if (category) {
      currentCategory = category;
    }

    const descriptor = parseMaterialDescriptor(getString(row, fields.materialName), getString(row, fields.spec));
    const materialName = descriptor.materialName;
    if (!materialName) {
      return;
    }

    supplierColumns.forEach((supplierColumn) => {
      const rawPrice = row[supplierColumn];
      if (!isUsablePrice(rawPrice)) {
        return;
      }

      const identity = parseQuoteIdentity(String(supplierColumn), supplierColumn, input.productName);
      const amount = toNumber(rawPrice);
      const canonicalRow: CanonicalBomRow = {
        id: `${input.fileId}-s${parsedSheet.sheetIndex + 1}-${rowIndex + 1}-${supplierColumn}`,
        sourceFileId: input.fileId,
        sourceFileName: input.fileName,
        sheetName: parsedSheet.sheetName,
        rowNumber: parsedSheet.headerRowIndex + rowIndex + 2,
        productName: identity.productName,
        productModel: identity.productModel,
        productColor: identity.productColor,
        quoteName: identity.quoteName,
        supplierName: hasMultipleSheets ? `${input.supplierName} - ${identity.supplierName}` : identity.supplierName,
        kind: input.kind,
        partNumber: "",
        materialName,
        normalizedName: descriptor.normalizedName,
        spec: descriptor.spec,
        category: currentCategory,
        unit: "pcs",
        quantity: 1,
        unitPrice: amount,
        amount,
        totalPrice: amount,
        currency: "CNY",
        remark: getString(row, fields.remark),
        isAmountCalculated: false,
        dataIssues: amount <= 0 ? [{ type: "missing_required_field", message: "供应商报价为空或小于等于 0。" }] : [],
        originalFields: {
          ...row,
          供应商列: supplierColumn,
          供应商报价: rawPrice
        },
        raw: row
      };

      rows.push(canonicalRow);
    });
  });

  return rows;
}

function isUsablePrice(value: unknown): boolean {
  const text = String(value ?? "").trim();
  return text !== "" && text !== "/" && text !== "-" && text.toLowerCase() !== "n/a";
}

function isTemplateInputSheetName(sheetName: string): boolean {
  return sheetName.trim() === "输入";
}

function isTemplateOutputSheetName(sheetName: string): boolean {
  return sheetName.trim() === "输出";
}

function isTemplateSummaryLabel(value: string): boolean {
  return /材料成本合计|物料成本|原材料成本|人工.*管理.*利润|核验总成本|出厂价/.test(value);
}

function readWorkbookSheets(workbook: XLSX.WorkBook): ParsedSheet[] {
  const inputSheetNames = workbook.SheetNames.filter(isTemplateInputSheetName);
  const sheetNames = inputSheetNames.length > 0 ? inputSheetNames : workbook.SheetNames.filter((sheetName) => !isTemplateOutputSheetName(sheetName));

  return sheetNames.map((sheetName) => readSheet(workbook, sheetName, workbook.SheetNames.indexOf(sheetName)))
    .filter((sheet) => sheet.rows.length > 0 || Object.keys(sheet.fieldMapping).length > 0);
}

function readSheet(workbook: XLSX.WorkBook, sheetName: string, sheetIndex: number): ParsedSheet {
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false
  });

  const headerRowIndex = findHeaderRow(matrix);
  const headers = makeUniqueHeaders(matrix[headerRowIndex] ?? []);
  const fieldMapping = mapHeader(headers);
  const rows = fillMergedCategoryValues(matrix
    .slice(headerRowIndex + 1)
    .map((cells) => rowFromCells(headers, cells))
    .filter((row) => Object.values(row).some(hasValue)), fieldMapping);

  const warnings: string[] = [];
  if (headerRowIndex > 0) {
    warnings.push(`自动跳过前 ${headerRowIndex} 行说明/空行，从第 ${headerRowIndex + 1} 行识别表头。`);
  }
  if (Object.keys(fieldMapping).length === 0) {
    warnings.push("未能识别标准 BOM 字段，请检查表头是否在第一张表中。");
  }

  return {
    sheetName,
    sheetIndex,
    headerRowIndex,
    headers,
    rows,
    fieldMapping,
    warnings
  };
}

function fillMergedCategoryValues(rows: Array<Record<string, unknown>>, fieldMapping: BomFieldMapping): Array<Record<string, unknown>> {
  const categoryKey = fieldMapping.category;
  if (!categoryKey) return rows;

  let currentCategory = "";
  return rows.map((row) => {
    const category = String(row[categoryKey] ?? "").trim();
    if (category) {
      currentCategory = category;
      return row;
    }
    if (!currentCategory) return row;
    return { ...row, [categoryKey]: currentCategory };
  });
}

function findHeaderRow(matrix: unknown[][]): number {
  let bestIndex = 0;
  let bestScore = -1;
  const maxScanRows = Math.min(matrix.length, 15);

  for (let index = 0; index < maxScanRows; index += 1) {
    const score = scoreHeaderRow(matrix[index] ?? []);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function makeUniqueHeaders(cells: unknown[]): string[] {
  const used = new Map<string, number>();
  return cells.map((cell, index) => {
    const base = String(cell ?? "").trim() || `未命名列${index + 1}`;
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function rowFromCells(headers: string[], cells: unknown[]): Record<string, unknown> {
  return headers.reduce<Record<string, unknown>>((row, header, index) => {
    row[header] = cells[index] ?? "";
    return row;
  }, {});
}

function toCanonicalRow(
  input: ParseInput,
  parsedSheet: ParsedSheet,
  row: Record<string, unknown>,
  index: number
): CanonicalBomRow {
  const fields = parsedSheet.fieldMapping;
  const quantityRaw = getValue(row, fields.quantity);
  const unitPriceRaw = getValue(row, fields.unitPrice);
  const amountRaw = getValue(row, fields.amount);
  const rawMaterialName = getString(row, fields.materialName);
  const rawSpec = getString(row, fields.spec);
  const rawRemark = getString(row, fields.remark);
  const descriptor = parseMaterialDescriptor(rawMaterialName, rawSpec);
  const rawCategory = getString(row, fields.category);
  const isTemplateSummaryRow = !descriptor.materialName && isTemplateSummaryLabel(rawCategory);
  const materialName = descriptor.materialName || (isTemplateSummaryRow ? rawCategory : "");
  const summaryAmountRaw = isTemplateSummaryRow && !hasValue(amountRaw) && !hasValue(quantityRaw) && hasValue(unitPriceRaw)
    ? unitPriceRaw
    : amountRaw;
  const inferredQuantity = inferQuantityFromText(rawMaterialName, rawSpec, rawRemark, quantityRaw);
  const explicitAmount = toNumber(summaryAmountRaw);
  const isSummaryRow = isSummaryCostItem(materialName, rawCategory);
  const quantity = toNumber(quantityRaw) || inferredQuantity.quantity || (isSummaryRow && explicitAmount > 0 ? 1 : 0);
  const unitPrice =
    toNumber(unitPriceRaw) ||
    inferUnitPriceFromText(rawMaterialName, rawSpec, rawRemark, unitPriceRaw, amountRaw) ||
    (isSummaryRow && explicitAmount > 0 ? explicitAmount : 0);
  const calculatedAmount = quantity * unitPrice;
  const shouldCalculateAmount = !hasValue(amountRaw) && quantity > 0 && unitPrice > 0;
  const amount = shouldCalculateAmount ? calculatedAmount : explicitAmount;
  const dataIssues = buildDataIssues({
    materialName,
    quantity,
    unitPrice,
    explicitAmount,
    calculatedAmount,
    hasExplicitAmount: hasValue(summaryAmountRaw)
  });
  const identity = parseQuoteIdentity(input.supplierName || parsedSheet.sheetName, input.supplierName, input.productName);

  return {
    id: `${input.fileId}-s${parsedSheet.sheetIndex + 1}-${index + 1}`,
    sourceFileId: input.fileId,
    sourceFileName: input.fileName,
    sheetName: parsedSheet.sheetName,
    rowNumber: parsedSheet.headerRowIndex + index + 2,
    productName: identity.productName,
    productModel: identity.productModel,
    productColor: identity.productColor,
    quoteName: identity.quoteName,
    supplierName: identity.supplierName,
    kind: input.kind,
    partNumber: getString(row, fields.partNumber),
    materialName,
    normalizedName: descriptor.normalizedName || normalizeMaterialName(materialName),
    spec: descriptor.spec,
    category: rawCategory,
    unit: normalizeUnit(getString(row, fields.unit)) || inferredQuantity.unit,
    quantity,
    unitPrice,
    amount,
    totalPrice: amount,
    currency: getString(row, fields.currency) || "CNY",
    remark: getString(row, fields.remark),
    isAmountCalculated: shouldCalculateAmount,
    dataIssues,
    originalFields: row,
    raw: row
  };
}

function buildDataIssues(input: {
  materialName: string;
  quantity: number;
  unitPrice: number;
  explicitAmount: number;
  calculatedAmount: number;
  hasExplicitAmount: boolean;
}): BomDataIssue[] {
  const issues: BomDataIssue[] = [];

  if (!input.materialName) {
    issues.push({ type: "missing_required_field", message: "缺少物料名称，无法稳定追溯该行。" });
  }

  if (input.quantity <= 0) {
    issues.push({ type: "missing_required_field", message: "数量为空或小于等于 0。" });
  }

  if (input.unitPrice <= 0) {
    issues.push({ type: "missing_required_field", message: "单价为空或小于等于 0。" });
  }

  if (input.hasExplicitAmount && input.quantity > 0 && input.unitPrice > 0) {
    const tolerance = Math.max(0.01, Math.abs(input.calculatedAmount) * 0.02);
    if (Math.abs(input.explicitAmount - input.calculatedAmount) > tolerance) {
      issues.push({
        type: "amount_mismatch",
        message: "金额与数量 x 单价不一致。",
        expected: roundMoney(input.calculatedAmount),
        actual: roundMoney(input.explicitAmount)
      });
    }
  }

  return issues;
}

function getValue(row: Record<string, unknown>, key?: string): unknown {
  return key ? row[key] : undefined;
}

function getString(row: Record<string, unknown>, key?: string): string {
  return String(getValue(row, key) ?? "").trim();
}

function parseQuoteIdentity(rawValue: string, fallbackSupplier: string, fallbackProduct: string): QuoteIdentity {
  const quoteName = rawValue.trim();
  const parts = quoteName.split(/\s*[-–—_]\s*/).map((part) => part.trim()).filter(Boolean);
  const hasStructuredTitle = parts.length >= 3;

  return {
    supplierName: hasStructuredTitle ? parts[0] : fallbackSupplier,
    productName: hasStructuredTitle ? parts[1] : fallbackProduct,
    productModel: hasStructuredTitle ? parts[2] : "",
    productColor: hasStructuredTitle ? parts.slice(3).join("-") : "",
    quoteName
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
