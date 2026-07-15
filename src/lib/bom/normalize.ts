import { findCategoryKnowledgeMatch, findMaterialKnowledgeMatch } from "./material-knowledge";

export type ParsedMaterialDescriptor = {
  materialName: string;
  spec: string;
  normalizedName: string;
};

const SPEC_PATTERNS = [
  /\b\d+(\.\d+)?\s*(mm|cm|m|w|v|a|ma|k|lm|kg|g|寸|inch|in)\b/gi,
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

  const extractedSpec = uniqueParts([rawSpec, ...extractSpecParts(merged)]).join(" ");
  const materialName = cleanupMaterialTitle(rawName || merged, extractedSpec);
  const baseText = materialName || merged;
  const knowledgeMatch = findMaterialKnowledgeMatch(baseText);
  const normalizedBase = knowledgeMatch?.canonicalName ?? normalizeMaterialBase(baseText);
  const specFingerprint = knowledgeMatch?.ignoreSpec ? "" : normalizeSpecFingerprint(extractedSpec);
  const normalizedName = [normalizedBase, specFingerprint].filter(Boolean).join("|");

  return {
    materialName: materialName || rawName || merged,
    spec: extractedSpec,
    normalizedName
  };
}

export function normalizeBomCategory(categoryValue: unknown, materialNameValue: unknown = ""): string {
  const text = cleanText(`${categoryValue ?? ""} ${materialNameValue ?? ""}`);
  const knowledgeCategory = findCategoryKnowledgeMatch(categoryValue, materialNameValue);
  if (knowledgeCategory) return knowledgeCategory;

  const lower = text.toLowerCase();
  if (/结构|外壳|壳体|铝|铁|钢|不锈钢|锌合金|合金|金属|支架|固定片|固定板|安装板|底座|底盘|灯体|塑件|塑胶|杆|管|框|边框|面罩|堵头|端盖|housing|case/.test(lower)) return "结构件";
  if (/驱动|电源|控制器|driver|power\s*supply|controller/.test(lower)) return "驱动/控制器";
  if (/线材|电线|电子线|电源线|插座|线夹|wire|cable/.test(lower)) return "线材";
  if (/电子|电阻|电容|芯片|pcb|ic|mcu|resistor|capacitor/.test(lower)) return "电子料";
  if (/光源|光电|灯珠|led|cob|铝基板/.test(lower)) return "光源";
  if (/包装|纸箱|彩盒|泡沫|泡棉|说明书|标签|外箱|carton|box|package/.test(lower)) return "包装";
  if (/五金|螺丝|螺母|垫片|扳手/.test(lower)) return "五金";
  if (/脚垫|胶水|酒精|辅料|杂项/.test(lower)) return "杂项";
  if (/人工|工时|组装|装配|labor/.test(lower)) return "人工";
  if (/表面|喷涂|电镀|氧化|烤漆|处理|finish|coating/.test(lower)) return "表面处理";
  if (/模具|治具|夹具|tooling|fixture|mold/.test(lower)) return "模具/治具";
  if (/物流|运输|损耗|运费|loss|freight|shipping/.test(lower)) return "物流/损耗";
  return "其他";
}

export function isSummaryCostItem(materialName: string, category = ""): boolean {
  const normalized = normalizeBomCategory(category, materialName);
  return ["材料成本合计", "人工", "人工/管理/利润", "出厂价"].includes(normalized);
}

export function isRollupCostRow(materialName: string, category = ""): boolean {
  const text = cleanText(`${category} ${materialName}`).toLowerCase();
  if (!text) return false;
  if (normalizeBomCategory(category, materialName) === "出厂价") return false;
  if (/明细|详情|子件|零件|物料/.test(text) && !/合计|小计|总计|汇总/.test(text)) return false;
  if (isCategoryNameOnlyRollup(materialName, category)) return true;
  return /合计|小计|总计|汇总|subtotal|total/.test(text);
}

export function inferQuantityFromText(...values: unknown[]): { quantity: number; unit: string } {
  const text = cleanText(values.join(" "));
  const match =
    text.match(/(?:数量|用量|个数|件数|qty|quantity|num)[:：]?\s*(\d+(?:\.\d+)?)\s*([a-zA-Z\u4e00-\u9fa5]*)/i) ??
    text.match(/\b(\d+(?:\.\d+)?)\s*(pcs|pc|个|只|件|套|set)\b/i);
  if (!match) return { quantity: 0, unit: "" };
  return {
    quantity: toNumber(match[1]),
    unit: normalizeUnit(match[2] ?? "")
  };
}

export function inferUnitPriceFromText(...values: unknown[]): number {
  const text = cleanText(values.join(" "));
  const match =
    text.match(/(?:单价|报价|价格|price|unit\s*price)[:：]?\s*[¥￥$]?\s*(\d+(?:\.\d+)?)/i) ??
    text.match(/[¥￥$]\s*(\d+(?:\.\d+)?)/);
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
    .replace(/[,，¥￥$]/g, "")
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

function isCategoryNameOnlyRollup(materialName: string, category: string): boolean {
  const categoryText = cleanText(category);
  const materialText = cleanText(materialName);
  if (!categoryText || !materialText) return false;
  const normalizedCategory = normalizeBomCategory(categoryText, "");
  const normalizedMaterial = normalizeBomCategory("", materialText);
  if (normalizedCategory === "其他" || normalizedCategory !== normalizedMaterial) return false;
  return stripComparableText(categoryText) === stripComparableText(materialText);
}

function stripComparableText(value: string): string {
  return value.toLowerCase().replace(/[^\p{Script=Han}a-z0-9/]+/giu, "");
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
    .replace(/(?:单价|报价|价格|price|unit\s*price)[:：]?\s*[¥￥$]?\s*\d+(\.\d+)?/gi, " ")
    .replace(/[【】[\]（）()]/g, " ")
    .replace(/[;；,，]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMaterialBase(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
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
