import * as XLSX from "xlsx";
import { BomDataIssue, BomFileKind, BomFieldMapping, BomFileRecord, CanonicalBomRow } from "@/types/bom";
import { mapHeader, scoreHeaderRow } from "./field-map";
import { hasValue, normalizeMaterialName, normalizeUnit, toNumber } from "./normalize";

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
  headerRowIndex: number;
  headers: string[];
  rows: Record<string, unknown>[];
  fieldMapping: BomFieldMapping;
  warnings: string[];
};

const REQUIRED_FIELDS: Array<keyof BomFieldMapping> = ["materialName", "quantity", "unitPrice"];

export function parseBomWorkbook(input: ParseInput): BomFileRecord {
  const workbook = XLSX.read(input.buffer, {
    type: "buffer",
    cellDates: false,
    codepage: input.extension === "csv" ? 65001 : undefined
  });

  if (workbook.SheetNames.length === 0) {
    throw new Error("文件中没有可读取的工作表。");
  }

  const parsedSheet = readFirstSheet(workbook);
  const rows = isWideSupplierSheet(parsedSheet)
    ? parseWideSupplierRows(input, parsedSheet)
    : parsedSheet.rows
        .map((row, index) => toCanonicalRow(input, parsedSheet, row, index))
        .filter((row) => row.materialName || row.partNumber || row.quantity || row.unitPrice || row.amount);

  const missingRequired = REQUIRED_FIELDS.filter((field) => !parsedSheet.fieldMapping[field]);
  const parseWarnings = [
    ...parsedSheet.warnings,
    ...(isWideSupplierSheet(parsedSheet) ? ["识别为多供应商横向报价表，已按供应商列展开为 BOM 明细。"] : []),
    ...(isWideSupplierSheet(parsedSheet) ? [] : missingRequired.map((field) => `未识别到关键字段：${field}`))
  ];

  return {
    id: input.fileId,
    fileName: input.fileName,
    productName: input.productName,
    supplierName: input.supplierName,
    kind: input.kind,
    uploadedAt: new Date().toISOString(),
    sheetName: parsedSheet.sheetName,
    rowCount: rows.length,
    fieldMapping: parsedSheet.fieldMapping,
    parseWarnings,
    rows
  };
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

function parseWideSupplierRows(input: ParseInput, parsedSheet: ParsedSheet): CanonicalBomRow[] {
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

    const materialName = getString(row, fields.materialName);
    if (!materialName) {
      return;
    }

    supplierColumns.forEach((supplierColumn) => {
      const rawPrice = row[supplierColumn];
      if (!isUsablePrice(rawPrice)) {
        return;
      }

      const amount = toNumber(rawPrice);
      const canonicalRow: CanonicalBomRow = {
        id: `${input.fileId}-${rowIndex + 1}-${supplierColumn}`,
        sourceFileId: input.fileId,
        sourceFileName: input.fileName,
        sheetName: parsedSheet.sheetName,
        rowNumber: parsedSheet.headerRowIndex + rowIndex + 2,
        productName: input.productName,
        supplierName: supplierColumn,
        kind: input.kind,
        partNumber: "",
        materialName,
        normalizedName: normalizeMaterialName(materialName),
        spec: "",
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

function readFirstSheet(workbook: XLSX.WorkBook): ParsedSheet {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false
  });

  const headerRowIndex = findHeaderRow(matrix);
  const headers = makeUniqueHeaders(matrix[headerRowIndex] ?? []);
  const fieldMapping = mapHeader(headers);
  const rows = matrix
    .slice(headerRowIndex + 1)
    .map((cells) => rowFromCells(headers, cells))
    .filter((row) => Object.values(row).some(hasValue));

  const warnings: string[] = [];
  if (headerRowIndex > 0) {
    warnings.push(`自动跳过前 ${headerRowIndex} 行说明/空行，从第 ${headerRowIndex + 1} 行识别表头。`);
  }
  if (Object.keys(fieldMapping).length === 0) {
    warnings.push("未能识别标准 BOM 字段，请检查表头是否在第一张表中。");
  }

  return {
    sheetName,
    headerRowIndex,
    headers,
    rows,
    fieldMapping,
    warnings
  };
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
  const quantity = toNumber(quantityRaw);
  const unitPrice = toNumber(unitPriceRaw);
  const explicitAmount = toNumber(amountRaw);
  const calculatedAmount = quantity * unitPrice;
  const shouldCalculateAmount = !hasValue(amountRaw) && quantity > 0 && unitPrice > 0;
  const amount = shouldCalculateAmount ? calculatedAmount : explicitAmount;
  const dataIssues = buildDataIssues({
    materialName: getString(row, fields.materialName),
    quantity,
    unitPrice,
    explicitAmount,
    calculatedAmount,
    hasExplicitAmount: hasValue(amountRaw)
  });

  return {
    id: `${input.fileId}-${index + 1}`,
    sourceFileId: input.fileId,
    sourceFileName: input.fileName,
    sheetName: parsedSheet.sheetName,
    rowNumber: parsedSheet.headerRowIndex + index + 2,
    productName: input.productName,
    supplierName: input.supplierName,
    kind: input.kind,
    partNumber: getString(row, fields.partNumber),
    materialName: getString(row, fields.materialName),
    normalizedName: normalizeMaterialName(getString(row, fields.materialName)),
    spec: getString(row, fields.spec),
    category: getString(row, fields.category),
    unit: normalizeUnit(getString(row, fields.unit)),
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

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
