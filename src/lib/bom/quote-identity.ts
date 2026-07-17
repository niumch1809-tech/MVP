export type QuoteIdentity = {
  supplierName: string;
  productName: string;
  productModel: string;
  productColor: string;
  quoteName: string;
};

const STRUCTURED_TITLE_SEPARATOR = /\s*[-–—_]\s*/;

export function parseQuoteIdentity(rawValue: string, fallbackSupplier: string, fallbackProduct: string): QuoteIdentity {
  const rawTitle = cleanText(rawValue);
  const parts = rawTitle.split(STRUCTURED_TITLE_SEPARATOR).map(cleanText).filter(Boolean);
  const hasStructuredTitle = parts.length >= 4;
  const supplierName = hasStructuredTitle ? parts[0] : cleanText(fallbackSupplier);
  const productName = hasStructuredTitle ? parts[1] : cleanText(fallbackProduct);
  const productModel = hasStructuredTitle ? parts[2] : "";
  const productColor = hasStructuredTitle ? parts.slice(3).join("-") : "";
  const displayQuoteName = [productName, productModel, productColor].filter(Boolean).join(" ");

  return {
    supplierName,
    productName,
    productModel,
    productColor,
    quoteName: displayQuoteName || rawTitle || supplierName
  };
}

export function findStructuredQuoteTitle(matrix: unknown[][], headerRowIndex: number): string {
  const scanRows = matrix.slice(0, Math.max(0, headerRowIndex));
  const candidates = scanRows
    .flatMap((row) => row.map((cell) => cleanText(cell)))
    .filter(isStructuredQuoteTitle);

  return candidates.sort((a, b) => scoreStructuredTitle(b) - scoreStructuredTitle(a))[0] ?? "";
}

export function isStructuredQuoteTitle(value: string): boolean {
  const text = cleanText(value);
  if (!text) return false;
  const parts = text.split(STRUCTURED_TITLE_SEPARATOR).map(cleanText).filter(Boolean);
  if (parts.length < 4) return false;
  const joined = parts.join("");
  if (/品类|物料|名称|规格|单位|数量|单价|金额|备注/.test(joined)) return false;
  return hasModelHint(parts[2]) || hasColorHint(parts.slice(3).join(""));
}

function scoreStructuredTitle(value: string): number {
  const parts = value.split(STRUCTURED_TITLE_SEPARATOR).map(cleanText).filter(Boolean);
  return parts.length * 10 + (hasModelHint(parts[2] ?? "") ? 8 : 0) + (hasColorHint(parts.slice(3).join("")) ? 8 : 0);
}

function hasModelHint(value: string): boolean {
  return /\d+\s*(寸|吋|inch|in\b|mm|cm)|型号|款|代|pro|max|mini|plus|智能|米家/i.test(value);
}

function hasColorHint(value: string): boolean {
  return /白|黑|金|银|灰|红|蓝|绿|黄|粉|紫|橙|色|white|black|gold|silver|gray|grey/i.test(value);
}

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}
