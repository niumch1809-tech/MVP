const materialAliases: Array<[RegExp, string]> = [
  [/电阻|resistor|res\b/i, "resistor"],
  [/电容|capacitor|cap\b/i, "capacitor"],
  [/芯片|ic|mcu|chip/i, "ic"],
  [/连接器|connector|conn/i, "connector"],
  [/螺丝|螺钉|screw/i, "screw"],
  [/螺母|螺帽|nut/i, "nut"],
  [/垫片|washer/i, "washer"],
  [/灯珠|led/i, "led"],
  [/光源|cob/i, "led"],
  [/驱动|电源|driver|power supply/i, "driver"],
  [/外壳|壳体|housing|case/i, "housing"],
  [/铝件|铝壳|五金|散热器|heatsink/i, "housing"],
  [/透镜|lens/i, "lens"],
  [/扩散板|扩散罩|diffuser/i, "diffuser"],
  [/pcb|电路板|铝基板/i, "pcb"],
  [/线材|导线|端子线|wire|cable/i, "wire"],
  [/纸箱|彩盒|包装盒|carton|box/i, "package"],
  [/泡棉|泡沫|foam/i, "foam"],
  [/说明书|manual/i, "manual"],
  [/标签|label/i, "label"]
];

type ParsedMaterialDescriptor = {
  materialName: string;
  spec: string;
  normalizedName: string;
};

const SPEC_PATTERNS = [
  /\b\d+(\.\d+)?\s*(mm|cm|m|w|v|a|ma|k|lm|kg|g)\b/gi,
  /\b\d+\s*[x*×]\s*\d+(\s*[x*×]\s*\d+)?\s*(mm|cm|m)?\b/gi,
  /\b(2835|3030|5050|3528|5730|cob|smd)\b/gi,
  /\b[0-9]+k\b/gi,
  /\b(ip\d{2}|ra\d{2}|cri\d{2})\b/gi,
  /[（(][^）)]{1,50}[）)]/g,
  /\[[^\]]{1,50}\]/g
];

export function normalizeMaterialName(value: unknown): string {
  const descriptor = parseMaterialDescriptor(value, "");
  return descriptor.normalizedName;
}

export function parseMaterialDescriptor(nameValue: unknown, specValue: unknown): ParsedMaterialDescriptor {
  const rawName = cleanText(nameValue);
  const rawSpec = cleanText(specValue);
  const merged = [rawName, rawSpec].filter(Boolean).join(" ");

  if (!merged) {
    return { materialName: "", spec: "", normalizedName: "" };
  }

  const extractedSpec = uniqueParts([
    rawSpec,
    ...extractSpecParts(merged)
  ]).join(" ");
  const materialName = cleanupMaterialTitle(rawName || merged, extractedSpec);
  const normalizedBase = normalizeMaterialBase(materialName || merged);
  const specFingerprint = normalizeSpecFingerprint(extractedSpec);
  const normalizedName = [normalizedBase, specFingerprint].filter(Boolean).join("|");

  return {
    materialName: materialName || rawName || merged,
    spec: extractedSpec,
    normalizedName
  };
}

export function inferQuantityFromText(...values: unknown[]): { quantity: number; unit: string } {
  const text = cleanText(values.join(" "));
  const match = text.match(/(?:数量|用量|个数|件数|qty|quantity|num)[:：]?\s*(\d+(?:\.\d+)?)\s*([a-zA-Z\u4e00-\u9fa5]*)/i)
    ?? text.match(/\b(\d+(?:\.\d+)?)\s*(pcs|pc|个|只|件|套|set)\b/i);
  if (!match) return { quantity: 0, unit: "" };
  return {
    quantity: toNumber(match[1]),
    unit: normalizeUnit(match[2] ?? "")
  };
}

export function inferUnitPriceFromText(...values: unknown[]): number {
  const text = cleanText(values.join(" "));
  const match = text.match(/(?:单价|报价|价格|price|unit\s*price)[:：]?\s*[￥¥$]?\s*(\d+(?:\.\d+)?)/i)
    ?? text.match(/[￥¥$]\s*(\d+(?:\.\d+)?)/);
  return match ? toNumber(match[1]) : 0;
}

export function normalizeUnit(value: unknown): string {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "";
  if (["个", "只", "pcs", "pc", "piece", "件"].includes(text)) return "pcs";
  if (["套", "set"].includes(text)) return "set";
  if (["米", "m", "meter"].includes(text)) return "m";
  if (["千克", "公斤", "kg"].includes(text)) return "kg";
  return text;
}

export function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = String(value ?? "")
    .replace(/[,，￥¥$]/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function hasValue(value: unknown): boolean {
  return String(value ?? "").trim() !== "";
}

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSpecParts(text: string): string[] {
  return SPEC_PATTERNS.flatMap((pattern) => Array.from(text.matchAll(pattern)).map((match) => match[0]));
}

function cleanupMaterialTitle(value: string, spec: string): string {
  let text = value;
  uniqueParts(extractSpecParts(spec)).forEach((part) => {
    text = text.replace(part, " ");
  });
  return text
    .replace(/(?:数量|用量|个数|件数|qty|quantity|num)[:：]?\s*\d+(\.\d+)?\s*[a-zA-Z\u4e00-\u9fa5]*/gi, " ")
    .replace(/(?:单价|报价|价格|price|unit\s*price)[:：]?\s*[￥¥$]?\s*\d+(\.\d+)?/gi, " ")
    .replace(/[【】\[\]（）()]/g, " ")
    .replace(/[;；,，|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMaterialBase(value: string): string {
  const text = value.trim().replace(/\s+/g, " ").toLowerCase();
  const alias = materialAliases.find(([pattern]) => pattern.test(text));
  if (alias) return alias[1];
  return text
    .replace(/[^\p{Script=Han}a-z0-9]+/giu, "")
    .slice(0, 48);
}

function normalizeSpecFingerprint(value: string): string {
  return uniqueParts(
    value
      .toLowerCase()
      .replace(/[（）()[\]]/g, " ")
      .split(/\s+/)
      .map((part) => part.replace(/[^\p{Script=Han}a-z0-9.×x*+-]+/giu, ""))
      .filter((part) => part.length > 0)
  )
    .slice(0, 6)
    .join("-");
}

function uniqueParts(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
