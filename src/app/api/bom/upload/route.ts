import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBomWorkbook } from "@/lib/bom/parser";
import { saveBomRecord } from "@/lib/storage";
import { BomFileKind, UploadBomResponse } from "@/types/bom";

export const runtime = "nodejs";

const uploadSchema = z.object({
  supplierName: z.string().optional(),
  kind: z.enum(["supplier_quote", "historical_bom"])
});

export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);
  const fallbackFile = formData.get("file");
  if (fallbackFile instanceof File && files.length === 0) {
    files.push(fallbackFile);
  }

  const parsedMeta = uploadSchema.safeParse({
    supplierName: formData.get("supplierName")?.toString().trim() || undefined,
    kind: formData.get("kind")
  });

  if (!parsedMeta.success) {
    return NextResponse.json({ message: "请选择文件类型。" }, { status: 400 });
  }

  if (files.length === 0) {
    return NextResponse.json({ message: "请上传至少一个 Excel 或 CSV 文件。" }, { status: 400 });
  }

  const response: UploadBomResponse = {
    records: [],
    errors: []
  };

  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["xlsx", "xls", "csv"].includes(extension)) {
      response.errors.push({ fileName: file.name, message: "仅支持 .xlsx、.xls、.csv 文件。" });
      continue;
    }

    try {
      const fileId = crypto.randomUUID();
      const buffer = Buffer.from(await file.arrayBuffer());
      const supplierName = parsedMeta.data.supplierName || inferSupplierName(file.name);
      const record = parseBomWorkbook({
        fileId,
        fileName: file.name,
        supplierName,
        kind: parsedMeta.data.kind as BomFileKind,
        buffer,
        extension
      });

      await saveBomRecord(record);
      response.records.push(record);
    } catch (error) {
      response.errors.push({
        fileName: file.name,
        message: error instanceof Error ? error.message : "文件解析失败。"
      });
    }
  }

  const status = response.records.length > 0 ? 200 : 400;
  return NextResponse.json(response, { status });
}

function inferSupplierName(fileName: string): string {
  return fileName
    .replace(/\.(xlsx|xls|csv)$/i, "")
    .replace(/bom|报价|报价格|清单|物料清单/gi, "")
    .replace(/[_-]+/g, " ")
    .trim() || "未命名供应商";
}
