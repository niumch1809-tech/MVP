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

type PriceFetchResult = {
  prices: MaterialMarketPrice[];
  sourceName: string;
  sourceKind: MaterialMarketPrice["sourceKind"];
};

const CATEGORY_BASE_PRICE: Record<string, number> = {
  结构件: 8.8,
  "驱动/控制器": 12.5,
  光源: 3.6,
  包装: 1.6,
  人工: 6.5,
  表面处理: 2.4,
  "模具/治具": 120,
  "物流/损耗": 1.1,
  五金: 0.35,
  线材: 0.85,
  杂项: 2.8,
  其他: 2.8
};

const KEYWORD_PRICE_RULES: Array<{ pattern: RegExp; price: number; unit?: string; note: string }> = [
  { pattern: /led|灯珠|光源|cob/i, price: 0.38, unit: "pcs", note: "按近期常规 LED/光源件参考价估算" },
  { pattern: /驱动|电源|driver|控制器/i, price: 12.5, unit: "pcs", note: "按近期常规灯具驱动/控制器参考价估算" },
  { pattern: /pcb|线路板|铝基板|pcba/i, price: 4.8, unit: "pcs", note: "按近期 PCB/铝基板参考价估算" },
  { pattern: /铝|铝材|铝框|铝杆|灯头|底盘|外壳|壳体|灯体/i, price: 9.6, unit: "pcs", note: "按近期铝件/结构件参考价估算" },
  { pattern: /铁|钢|杆|支架/i, price: 7.8, unit: "pcs", note: "按近期钢铁结构件参考价估算" },
  { pattern: /铜|电线|线材|端子|接线/i, price: 1.15, unit: "pcs", note: "按近期铜线/端子件参考价估算" },
  { pattern: /透镜|扩散|pc罩|面罩|塑料|塑胶|abs|pc/i, price: 2.2, unit: "pcs", note: "按近期塑胶/透镜/扩散件参考价估算" },
  { pattern: /螺丝|螺钉|垫片|扳手/i, price: 0.06, unit: "pcs", note: "按近期标准紧固件参考价估算" },
  { pattern: /纸箱|彩盒|包装|泡棉|标签|说明书|胶袋|袋/i, price: 2.1, unit: "pcs", note: "按近期常规包装件参考价估算" },
  { pattern: /酒精|胶水|辅料|耗材/i, price: 50, unit: "桶", note: "按近期辅料整包装参考价估算，核价时需结合 BOM 用量" }
];

export async function getMaterialPriceComparisons(rows: QuoteRow[], provider: PriceProviderInput = {}): Promise<MaterialPriceQuoteResponse> {
  const envProviderUrl = typeof process !== "undefined" ? process.env.MATERIAL_PRICE_PROVIDER_URL : undefined;
  const externalUrl = provider.providerUrl?.trim() || envProviderUrl;
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
    const external = await fetchExternalPrices(externalUrl, rows, generatedAt);
    return {
      generatedAt,
      sourceName: external.sourceName,
      sourceKind: external.sourceKind,
      comparisons: compareRowsWithPrices(rows, external.prices)
    };
  }

  const recentPrices = rows.map((row) => buildRecentMarketPrice(row, generatedAt));
  return {
    generatedAt,
    sourceName: "MVP 近期常规原材料参考库",
    sourceKind: "mock",
    comparisons: compareRowsWithPrices(rows, recentPrices)
  };
}

async function fetchExternalPrices(url: string, rows: QuoteRow[], updatedAt: string): Promise<PriceFetchResult> {
  const apiPrices = await tryFetchPriceApi(url, rows);
  if (apiPrices.length > 0) {
    return {
      prices: apiPrices,
      sourceName: "外部材料价格 API",
      sourceKind: "external"
    };
  }

  const pagePrices = await tryCrawlPricePage(url, rows, updatedAt);
  if (pagePrices.length > 0) {
    return {
      prices: pagePrices,
      sourceName: "网页抓取材料参考价",
      sourceKind: "crawled"
    };
  }

  throw new Error("未能从 URL 读取到材料参考价。若目标网站禁止跨域读取，请上传价格表或接入可返回 JSON 的价格 API。");
}

async function tryFetchPriceApi(url: string, rows: QuoteRow[]): Promise<MaterialMarketPrice[]> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows }),
      cache: "no-store"
    });

    if (!response.ok) return [];
    const payload = (await response.json()) as ExternalPriceResponse;
    return Array.isArray(payload.prices) ? payload.prices : [];
  } catch {
    return [];
  }
}

async function tryCrawlPricePage(url: string, rows: QuoteRow[], updatedAt: string): Promise<MaterialMarketPrice[]> {
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    if (!response.ok) return [];
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    if (contentType.includes("application/json")) {
      const payload = JSON.parse(text) as ExternalPriceResponse;
      if (Array.isArray(payload.prices)) return payload.prices;
    }

    return scrapePricesFromPageText(text, rows, url, updatedAt);
  } catch {
    return [];
  }
}

function buildRecentMarketPrice(row: QuoteRow, updatedAt: string): MaterialMarketPrice {
  const text = `${row.materialName} ${row.normalizedName} ${row.spec}`;
  const keywordRule = KEYWORD_PRICE_RULES.find((rule) => rule.pattern.test(text));
  const category = normalizeCostCategory(row.category, row.materialName);
  const fallbackPrice = CATEGORY_BASE_PRICE[category] ?? CATEGORY_BASE_PRICE.其他;
  const referenceUnitPrice = keywordRule?.price ?? fallbackPrice;

  return {
    materialName: row.materialName,
    normalizedName: row.normalizedName || row.materialName.trim().toLowerCase(),
    category,
    unit: keywordRule?.unit ?? row.unit,
    currency: row.currency || "CNY",
    referenceUnitPrice,
    sourceName: "MVP 近期常规原材料参考库",
    sourceKind: "mock",
    updatedAt,
    confidence: keywordRule ? 0.78 : 0.52,
    note: keywordRule?.note ?? `按${category}品类近期参考区间估算`
  };
}

function scrapePricesFromPageText(text: string, rows: QuoteRow[], sourceUrl: string, updatedAt: string): MaterialMarketPrice[] {
  const lines = htmlToPriceLines(text);
  const uniqueRows = Array.from(new Map(rows.map((row) => [normalizeText(row.normalizedName || row.materialName), row])).values());
  const host = safeHost(sourceUrl);

  return uniqueRows
    .map((row): MaterialMarketPrice | null => {
      const match = findPriceLineForRow(row, lines);
      if (!match) return null;
      const category = normalizeCostCategory(row.category, row.materialName);
      return {
        materialName: row.materialName,
        normalizedName: row.normalizedName || row.materialName.trim().toLowerCase(),
        category,
        unit: row.unit || "pcs",
        currency: row.currency || "CNY",
        referenceUnitPrice: match.price,
        sourceName: host,
        sourceKind: "crawled" as const,
        updatedAt,
        confidence: match.confidence,
        note: `从 URL 文本行提取：${match.line.slice(0, 80)}`
      };
    })
    .filter((price): price is MaterialMarketPrice => Boolean(price));
}

function htmlToPriceLines(text: string): string[] {
  const cleaned = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(tr|p|li|div|h\d)>/gi, "\n")
    .replace(/<\/(td|th)>/gi, "\t")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");

  return cleaned
    .split(/\n|[\r]+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 4);
}

function findPriceLineForRow(row: QuoteRow, lines: string[]): { line: string; price: number; confidence: number } | null {
  const names = [row.normalizedName, row.materialName, row.category, ...row.materialName.split(/[\/\s,，、-]+/g)]
    .map((value) => normalizeText(value))
    .filter((value) => value.length >= 2);

  let best: { line: string; price: number; confidence: number } | null = null;
  lines.forEach((line) => {
    const normalizedLine = normalizeText(line);
    const hitCount = names.filter((name) => normalizedLine.includes(name)).length;
    if (hitCount === 0) return;
    const price = extractLikelyPrice(line);
    if (price <= 0) return;
    const confidence = Math.min(0.88, 0.48 + hitCount * 0.16);
    if (!best || confidence > best.confidence) {
      best = { line, price, confidence };
    }
  });

  return best;
}

function extractLikelyPrice(line: string): number {
  const numbers = Array.from(line.matchAll(/(?:¥|￥|rmb|cny)?\s*(\d+(?:\.\d+)?)/gi))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0 && value < 100000);
  if (numbers.length === 0) return 0;
  const nonDateLike = numbers.filter((value) => value < 1000 || !String(value).startsWith("20"));
  return nonDateLike[nonDateLike.length - 1] ?? numbers[numbers.length - 1] ?? 0;
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
        rule: "未命中材料参考价源返回的参考价",
        suggestion: "可上传材料价格表，或输入可公开读取的价格网页/API URL。"
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

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "网页价格源";
  }
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}
