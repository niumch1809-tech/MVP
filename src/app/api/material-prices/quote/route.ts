import { NextRequest, NextResponse } from "next/server";
import { getMaterialPriceComparisons } from "@/lib/bom/material-price";
import { MaterialPriceQuoteRequest } from "@/types/bom";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as MaterialPriceQuoteRequest;
    const rows = Array.isArray(payload.rows) ? payload.rows : [];

    if (rows.length === 0) {
      return NextResponse.json({ message: "缺少需要核价的 BOM 明细。" }, { status: 400 });
    }

    const result = await getMaterialPriceComparisons(rows);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "材料价格接口调用失败。";
    return NextResponse.json({ message }, { status: 500 });
  }
}
