"use client";

import * as XLSX from "xlsx";
import { MaterialMarketPrice } from "@/types/bom";

type PriceField = "materialName" | "normalizedName" | "category" | "unit" | "referenceUnitPrice" | "currency" | "sourceName" | "updatedAt" | "note";

const FIELD_ALIASES: Record<PriceField, string[]> = {
  materialName: ["物料名称", "材料名称", "名称", "品名", "物料", "材料", "material", "material name", "name"],
  normalizedName: ["标准名", "标准名称", "归一名称", "normalized", "normalized name"],
  category: ["品类", "类别", "分类", "材料类别", "category"],
  unit: ["单位", "计价单位", "unit"],
  referenceUnitPrice: ["参考价", "市场价", "行情价", "材料价", "单价", "价格", "price", "unit price", "reference price"],
  currency: ["币种", "货币", "currency"],
  sourceName: ["来源", "价格来源", "source"],
  updatedAt: ["更新时间", "更新日期", "日期", "updated at", "date"],
  note: ["备注", "说明", "note", "remark"]
};

export async function parseMaterialPriceFile(file: File): Promise<MaterialMarketPrice[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    codepage: file.name.toLowerCase().endsWith(".csv") ? 65001 : undefined
  });

  if (workbook.SheetNames.length === 0) {
    throw new Error("价格表中没有可读取的工作表。");
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
  const headerRowIndex = findHeaderRow(matrix);
  const headers = makeUniqueHeaders(matrix[headerRowIndex] ?? []);
  const mapping = mapPriceHeaders(headers);

  if (!mapping.materialName || !mapping.referenceUnitPrice) {
    throw new Error("价格表至少需要包含物料名称和参考价/市场价字段。");
  }

  return matrix
    .slice(headerRowIndex + 1)
    .map((cells) => rowFromCells(headers, cells))
    .map((row) => toMarketPrice(row, mapping, file.name))
    .filter((price): price is MaterialMarketPrice => Boolean(price));
}

function toMarketPrice(row: Record<string, unknown>, mapping: Partial<Record<PriceField, string>>, fileName: string): MaterialMarketPrice | null {
  const materialName = getString(row, mapping.materialName);
  const referenceUnitPrice = toNumber(getString(row, mapping.referenceUnitPrice));
  if (!materialName || referenceUnitPrice <= 0) return null;

  return {
    materialName,
    normalizedName: getString(row, mapping.normalizedName) || materialName.trim().toLowerCase(),
    category: getString(row, mapping.category),
    unit: getString(row, mapping.unit) || "pcs",
    currency: getString(row, mapping.currency) || "CNY",
    referenceUnitPrice,
    sourceName: getString(row, mapping.sourceName) || fileName,
    sourceKind: "uploaded",
    updatedAt: normalizeDate(getString(row, mapping.updatedAt)) || new Date().toISOString(),
    confidence: 0.86,
    note: getString(row, mapping.note) || "来自网页上传材料价格表"
  };
}

function findHeaderRow(matrix: unknown[][]): number {
  let bestIndex = 0;
  let bestScore = -1;
  const maxRows = Math.min(matrix.length, 12);

  for (let index = 0; index < maxRows; index += 1) {
    const row = matrix[index] ?? [];
    let score = 0;
    row.forEach((cell) => {
      score += scoreHeader(String(cell ?? ""));
    });
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function scoreHeader(header: string): number {
  const normalized = normalizeText(header);
  return Object.values(FIELD_ALIASES).some((aliases) => aliases.some((alias) => normalizeText(alias) === normalized)) ? 1 : 0;
}

function mapPriceHeaders(headers: string[]): Partial<Record<PriceField, string>> {
  const result: Partial<Record<PriceField, string>> = {};
  headers.forEach((header) => {
    const normalized = normalizeText(header);
    (Object.keys(FIELD_ALIASES) as PriceField[]).forEach((field) => {
      if (!result[field] && FIELD_ALIASES[field].some((alias) => normalizeText(alias) === normalized)) {
        result[field] = header;
      }
    });
  });
  return result;
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

function getString(row: Record<string, unknown>, key?: string): string {
  return key ? String(row[key] ?? "").trim() : "";
}

function toNumber(value: string): number {
  const cleaned = value.replace(/,/g, "").replace(/[^\d.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function normalizeDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
