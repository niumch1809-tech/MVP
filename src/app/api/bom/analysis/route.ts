import { NextResponse } from "next/server";
import { buildAnalysisReport } from "@/lib/bom/analyzer";
import { listBomRecords } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  const records = await listBomRecords();
  return NextResponse.json(buildAnalysisReport(records));
}
