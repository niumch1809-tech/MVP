import {
  CanonicalBomRow,
  MaterialMarketPrice,
  MaterialPriceComparison,
  MaterialPriceQuoteResponse
} from "@/types/bom";
import { normalizeCostCategory } from "./cost-comparison";

const HIGH_PRICE_GAP = 0.3;
const MEDIUM_PRICE_GAP = 0.12;

type QuoteRow = Pick<
  CanonicalBomRow,
  "id" | "materialName" | "normalizedName" | "category" | "spec" | "unit" | "unitPrice" | "supplierName" | "currency"
>;

type PriceProviderInput = {
  providerUrl?: string;
  prices?: MaterialMarketPrice[];
};

type ExternalPriceResponse = {
  prices?: MaterialMarketPrice[];
};

const CATEGORY_BASE_PRICE: Record<string, number> = {
  "结构件": 8.8,
  "电子料": 1.2,
  "光源": 3.6,
  "包装": 1.6,
  "人工": 6.5,
  "表面处理": 2.4,
  "模具/治具": 120,
  "物流/损耗": 1.1,
  "其他": 2.8
};

const KEYWORD_PRICE_RULES: Array<{ pattern: RegExp; price: number; unit?: string; note: string }> = [
  { pattern: /led|灯珠|光源|cob/i, price: 0.38, unit: "pcs", note: "按常见 LED/光源件估算" },
  { pattern: /驱动|电源|driver/i, price: 12.5, unit: "pcs", note: "按常规灯具驱动电源估算" },
  { pattern: /pcb|线路板|铝基板/i, price: 4.8, unit: "pcs", note: "按常规 PCB/铝基板估算" },
  { pattern: /外壳|壳体|灯体|五金|铝/i, price: 9.6, unit: "pcs", note: "按铝件/五金结构件估算" },
  { pattern: /透镜|扩散|pc罩|面罩/i, price: 2.2, unit: "pcs", note: "按透镜/扩散件估算" },
  { pattern: /螺丝|螺钉|垫片/i, price: 0.06, unit: "pcs", note: "按标准紧固件估算" },
  { pattern: /纸箱|彩盒|包装|泡棉/i, price: 2.1, unit: "pcs", note: "按常规包装件估算" },
  { pattern: /线材|端子|接线/i, price: 0.85, unit: "pcs", note: "按常规线材端子估算" }
];

export async function getMaterialPriceComparisons(rows: QuoteRow[], provider: PriceProviderInput = {}): Promise<MaterialPriceQuoteResponse> {
  const externalUrl = provider.providerUrl?.trim() || process.env.MATERIAL_PRICE_PROVIDER_URL;
  const generatedAt = new Date().toISOString();

  if (provider.prices && provider.prices.length > 0) {
    return {
      generatedAt,
      sourceName: "网页上传材料价格表",
      sourceKind: "uploaded",
      comparisons: compareRowsWithPrices(rows, provider.prices)
    };
  }

  if (externalUrl) {
    const externalPrices = await fetchExternalPrices(externalUrl, rows);
    return {
      generatedAt,
      sourceName: "外部材料价格接口",
      sourceKind: "external",
      comparisons: compareRowsWithPrices(rows, externalPrices)
    };
  }

  const mockPrices = rows.map((row) => buildMockMarketPrice(row, generatedAt));
  return {
    generatedAt,
    sourceName: "MVP 常规材料价格 Mock",
    sourceKind: "mock",
    comparisons: compareRowsWithPrices(rows, mockPrices)
  };
}

async function fetchExternalPrices(url: string, rows: QuoteRow[]): Promise<MaterialMarketPrice[]> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rows }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`材料价格接口返回 ${response.status}`);
  }

  const payload = (await response.json()) as ExternalPriceResponse;
  return Array.isArray(payload.prices) ? payload.prices : [];
}

function buildMockMarketPrice(row: QuoteRow, updatedAt: string): MaterialMarketPrice {
  const text = `${row.materialName} ${row.normalizedName} ${row.spec}`;
  const keywordRule = KEYWORD_PRICE_RULES.find((rule) => rule.pattern.test(text));
  const category = normalizeCostCategory(row.category, row.materialName);
  const fallbackPrice = CATEGORY_BASE_PRICE[category] ?? CATEGORY_BASE_PRICE["其他"];
  const referenceUnitPrice = keywordRule?.price ?? fallbackPrice;

  return {
    materialName: row.materialName,
    normalizedName: row.normalizedName || row.materialName.trim().toLowerCase(),
    category,
    unit: keywordRule?.unit ?? row.unit,
    currency: row.currency || "CNY",
    referenceUnitPrice,
    sourceName: "MVP 常规材料价格 Mock",
    sourceKind: "mock",
    updatedAt,
    confidence: keywordRule ? 0.78 : 0.52,
    note: keywordRule?.note ?? `按${category}品类均价估算`
  };
}

function compareRowsWithPrices(rows: QuoteRow[], prices: MaterialMarketPrice[]): MaterialPriceComparison[] {
  return rows.map((row) => {
    const price = findBestPrice(row, prices);
    if (!price) {
      return {
        rowId: row.id,
        materialName: row.materialName,
        supplierName: row.supplierName,
        supplierUnitPrice: row.unitPrice,
        currency: row.currency || "CNY",
        riskLevel: "none",
        status: "not_found",
        rule: "未命中材料价格接口返回的参考价",
        suggestion: "加入材料标准库或手工维护该物料参考价。"
      };
    }

    const supplierUnitPrice = Number.isFinite(row.unitPrice) ? row.unitPrice : 0;
    const referenceUnitPrice = price.referenceUnitPrice;
    const differenceAmount = supplierUnitPrice - referenceUnitPrice;
    const differenceRate = referenceUnitPrice > 0 ? differenceAmount / referenceUnitPrice : 0;
    const riskLevel = getRiskLevel(differenceRate);
    const status = unitsCompatible(row.unit, price.unit) ? "matched" : "unit_mismatch";

    return {
      rowId: row.id,
      materialName: row.materialName,
      supplierName: row.supplierName,
      supplierUnitPrice,
      referenceUnitPrice,
      currency: price.currency,
      differenceAmount,
      differenceRate,
      riskLevel: status === "unit_mismatch" ? "medium" : riskLevel,
      status,
      sourceName: price.sourceName,
      sourceKind: price.sourceKind,
      updatedAt: price.updatedAt,
      rule: `供应商单价 ${formatNumber(supplierUnitPrice)} vs 参考价 ${formatNumber(referenceUnitPrice)}，阈值：12% 需核验，30% 高风险。`,
      suggestion: buildSuggestion(differenceRate, status, price.note)
    };
  });
}

function findBestPrice(row: QuoteRow, prices: MaterialMarketPrice[]): MaterialMarketPrice | undefined {
  const rowName = normalizeText(row.normalizedName || row.materialName);
  const rowMaterial = normalizeText(row.materialName);
  const rowCategory = normalizeCostCategory(row.category, row.materialName);

  return prices.find((price) => normalizeText(price.normalizedName || price.materialName) === rowName)
    ?? prices.find((price) => normalizeText(price.materialName) === rowMaterial)
    ?? prices.find((price) => price.category === rowCategory);
}

function unitsCompatible(rowUnit: string, priceUnit: string): boolean {
  const left = normalizeUnit(rowUnit);
  const right = normalizeUnit(priceUnit);
  return !left || !right || left === right;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function normalizeUnit(value: string): string {
  const unit = value.trim().toLowerCase();
  if (["个", "只", "pcs", "pc", "件", "pcs."].includes(unit)) return "pcs";
  if (["套", "set"].includes(unit)) return "set";
  if (["米", "m", "meter"].includes(unit)) return "m";
  return unit;
}

function getRiskLevel(differenceRate: number): MaterialPriceComparison["riskLevel"] {
  const absRate = Math.abs(differenceRate);
  if (absRate >= HIGH_PRICE_GAP) return "high";
  if (absRate >= MEDIUM_PRICE_GAP) return "medium";
  if (absRate > 0) return "low";
  return "none";
}

function buildSuggestion(differenceRate: number, status: MaterialPriceComparison["status"], note: string): string {
  if (status === "unit_mismatch") {
    return `单位与参考价不一致，先确认报价单位和换算关系。${note}`;
  }
  if (differenceRate >= HIGH_PRICE_GAP) {
    return `供应商报价显著高于参考价，建议要求供应商拆解规格、用量和涨价原因。${note}`;
  }
  if (differenceRate <= -HIGH_PRICE_GAP) {
    return `供应商报价显著低于参考价，建议确认是否缺规格、少工序或单位不一致。${note}`;
  }
  if (Math.abs(differenceRate) >= MEDIUM_PRICE_GAP) {
    return `价格偏离参考区间，建议进入核价清单。${note}`;
  }
  return `价格接近参考区间，可作为低优先级复核项。${note}`;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}
