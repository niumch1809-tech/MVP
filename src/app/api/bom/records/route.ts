import { NextResponse } from "next/server";
import { clearBomRecords, listBomRecords } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await listBomRecords());
}

export async function DELETE() {
  await clearBomRecords();
  return NextResponse.json({ ok: true });
}
