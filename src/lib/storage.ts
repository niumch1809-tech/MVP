import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { BomFileRecord, CanonicalBomRow } from "@/types/bom";

const dataDir = path.join(process.cwd(), "data");
const recordsPath = path.join(dataDir, "bom-records.json");

export async function listBomRecords(): Promise<BomFileRecord[]> {
  try {
    const content = await readFile(recordsPath, "utf8");
    return (JSON.parse(content) as BomFileRecord[]).map(normalizeRecord);
  } catch {
    return [];
  }
}

export async function saveBomRecord(record: BomFileRecord): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const records = await listBomRecords();
  await writeFile(recordsPath, JSON.stringify([record, ...records], null, 2), "utf8");
}

export async function clearBomRecords(): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(recordsPath, "[]", "utf8");
}

function normalizeRecord(record: BomFileRecord): BomFileRecord {
  return {
    ...record,
    sheetName: record.sheetName ?? "Sheet1",
    fieldMapping: record.fieldMapping ?? {},
    parseWarnings: record.parseWarnings ?? [],
    rows: (record.rows ?? []).map((row) => normalizeRow(row, record))
  };
}

function normalizeRow(row: CanonicalBomRow, record: BomFileRecord): CanonicalBomRow {
  const amount = row.amount ?? row.totalPrice ?? 0;
  return {
    ...row,
    sourceFileName: row.sourceFileName ?? record.fileName,
    sheetName: row.sheetName ?? record.sheetName ?? "Sheet1",
    rowNumber: row.rowNumber ?? 0,
    category: row.category ?? "",
    amount,
    totalPrice: amount,
    remark: row.remark ?? "",
    isAmountCalculated: row.isAmountCalculated ?? false,
    dataIssues: row.dataIssues ?? [],
    originalFields: row.originalFields ?? row.raw ?? {},
    raw: row.raw ?? row.originalFields ?? {}
  };
}
