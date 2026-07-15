import * as XLSX from "xlsx";
import { mapHeader, scoreHeaderRow } from "./field-map";
import { classifyComplexBomRow, ComplexBomRowType } from "./row-classifier";

export type ComplexSheetRow = {
  rowIndex: number;
  cells: unknown[];
  type: ComplexBomRowType;
  reason: string;
};

export type ComplexSheetBlock = {
  sheetName: string;
  title: string;
  headerRowIndex: number;
  endRowIndex: number;
  headers: string[];
  fieldMapping: ReturnType<typeof mapHeader>;
  rows: ComplexSheetRow[];
};

export type ComplexSheetStructure = {
  sheetName: string;
  sheetIndex: number;
  matrix: unknown[][];
  mergeCount: number;
  rowCount: number;
  columnCount: number;
  clearHeaderRows: number[];
  repeatedHeaderRows: number[];
  sectionRows: Array<{ rowIndex: number; title: string }>;
  subtotalRows: number[];
  unknownRows: number[];
  blocks: ComplexSheetBlock[];
  isComplex: boolean;
  reasons: string[];
};

export function analyzeSheetStructure(workbook: XLSX.WorkBook, sheetName: string, sheetIndex: number): ComplexSheetStructure {
  const sheet = workbook.Sheets[sheetName];
  const matrix = readMergedMatrix(sheet);
  const rowClassifications = matrix.map((cells, rowIndex) => {
    const classification = classifyComplexBomRow(cells);
    return { rowIndex, cells, ...classification };
  });
  const clearHeaderRows = rowClassifications
    .filter((row) => row.type === "header" && scoreHeaderRow(row.cells) >= 3)
    .map((row) => row.rowIndex);
  const repeatedHeaderRows = clearHeaderRows.slice(1);
  const sectionRows = rowClassifications
    .filter((row) => row.type === "section_title")
    .map((row) => ({ rowIndex: row.rowIndex, title: getRowTitle(row.cells) }));
  const subtotalRows = rowClassifications.filter((row) => row.type === "subtotal").map((row) => row.rowIndex);
  const unknownRows = rowClassifications.filter((row) => row.type === "unknown").map((row) => row.rowIndex);
  const mergeCount = sheet["!merges"]?.length ?? 0;
  const columnCount = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  const blocks = buildBlocks(sheetName, rowClassifications, sectionRows, clearHeaderRows);
  const reasons = buildComplexityReasons({
    clearHeaderRows,
    repeatedHeaderRows,
    sectionRows,
    subtotalRows,
    mergeCount,
    rowCount: matrix.length,
    blocks
  });

  return {
    sheetName,
    sheetIndex,
    matrix,
    mergeCount,
    rowCount: matrix.length,
    columnCount,
    clearHeaderRows,
    repeatedHeaderRows,
    sectionRows,
    subtotalRows,
    unknownRows,
    blocks,
    isComplex: reasons.length > 0,
    reasons
  };
}

function readMergedMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  const matrix: unknown[][] = [];
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row: unknown[] = [];
    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      row[columnIndex] = sheet[address]?.w ?? sheet[address]?.v ?? "";
    }
    matrix[rowIndex] = row;
  }

  (sheet["!merges"] ?? []).forEach((merge) => {
    const sourceAddress = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
    const sourceValue = sheet[sourceAddress]?.w ?? sheet[sourceAddress]?.v ?? "";
    if (String(sourceValue ?? "").trim() === "") return;
    for (let rowIndex = merge.s.r; rowIndex <= merge.e.r; rowIndex += 1) {
      matrix[rowIndex] = matrix[rowIndex] ?? [];
      for (let columnIndex = merge.s.c; columnIndex <= merge.e.c; columnIndex += 1) {
        if (String(matrix[rowIndex][columnIndex] ?? "").trim() === "") {
          matrix[rowIndex][columnIndex] = sourceValue;
        }
      }
    }
  });

  return matrix;
}

function buildBlocks(
  sheetName: string,
  rows: ComplexSheetRow[],
  sectionRows: Array<{ rowIndex: number; title: string }>,
  headerRows: number[]
): ComplexSheetBlock[] {
  return headerRows.map((headerRowIndex, blockIndex) => {
    const nextHeaderRowIndex = headerRows[blockIndex + 1] ?? Number.POSITIVE_INFINITY;
    const endRowIndex = Math.min(nextHeaderRowIndex - 1, rows[rows.length - 1]?.rowIndex ?? headerRowIndex);
    const nearestSection = [...sectionRows].reverse().find((section) => section.rowIndex < headerRowIndex);
    const title = nearestSection?.title || `${sheetName} 区块 ${blockIndex + 1}`;
    const headerCells = rows.find((row) => row.rowIndex === headerRowIndex)?.cells ?? [];
    const headers = makeUniqueHeaders(headerCells);
    const fieldMapping = mapHeader(headers);
    const blockRows = rows.filter((row) => row.rowIndex > headerRowIndex && row.rowIndex <= endRowIndex);

    return {
      sheetName,
      title,
      headerRowIndex,
      endRowIndex,
      headers,
      fieldMapping,
      rows: blockRows
    };
  });
}

function buildComplexityReasons(input: {
  clearHeaderRows: number[];
  repeatedHeaderRows: number[];
  sectionRows: Array<{ rowIndex: number; title: string }>;
  subtotalRows: number[];
  mergeCount: number;
  rowCount: number;
  blocks: ComplexSheetBlock[];
}): string[] {
  const reasons: string[] = [];
  if (input.clearHeaderRows.length !== 1) {
    reasons.push(input.clearHeaderRows.length === 0 ? "没有识别到唯一清晰表头" : `识别到 ${input.clearHeaderRows.length} 个表头行`);
  }
  if (input.sectionRows.length >= 2) reasons.push(`识别到 ${input.sectionRows.length} 个分段标题`);
  if (input.repeatedHeaderRows.length > 0) reasons.push(`识别到 ${input.repeatedHeaderRows.length} 个重复表头`);
  if (input.mergeCount >= 4 || input.mergeCount >= Math.max(2, input.rowCount * 0.08)) reasons.push(`识别到 ${input.mergeCount} 个合并单元格`);
  if (input.subtotalRows.length >= 1) reasons.push(`识别到 ${input.subtotalRows.length} 个小计/合计行`);
  if (input.blocks.length >= 2) reasons.push(`拆分出 ${input.blocks.length} 个可解析区块`);
  return reasons;
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

function getRowTitle(cells: unknown[]): string {
  return cells.map((cell) => String(cell ?? "").trim()).filter(Boolean).join(" / ");
}
