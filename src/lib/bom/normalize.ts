import { findCategoryKnowledgeMatch, findMaterialKnowledgeMatch } from "./material-knowledge";

export const STANDARD_MATERIAL_CATEGORIES = [
  "结构件",
  "光源",
  "包装",
  "驱动/控制器",
  "五金",
  "线材",
  "叶片组",
  "电机",
  "杂项"
] as const;

const SUMMARY_COST_CATEGORIES = new Set([
  "人工",
  "人工/管理/利润",
  "材料成本合计",
  "出厂价"
]);

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
  const rawCategory = cleanText(categoryValue);
  const text = cleanText(`${rawCategory} ${materialNameValue ?? ""}`);
  const knowledgeCategory = findCategoryKnowledgeMatch(categoryValue, materialNameValue);
  if (knowledgeCategory) return coercePlatformCategory(knowledgeCategory);

  const lower = text.toLowerCase();
  if (/材料成本合计|物料成本合计|原材料成本|材料合计|物料合计|bom合计|总材料/.test(lower)) return "材料成本合计";
  if (/出厂价|工厂价|最终成本|最终报价|核验总成本|含税出厂/.test(lower)) return "出厂价";
  if (/人工.*管理|人工.*利润|管理费|管理成本|利润|毛利/.test(lower)) return "人工/管理/利润";
  if (/人工|工时|组装|装配|labor/.test(lower)) return "人工";
  if (/叶片|扇叶|风叶|blade/.test(lower)) return "叶片组";
  if (/电机|马达|motor/.test(lower)) return "电机";
  if (/吊钟|吊盅|吊杆|吊管|灯盘|吸顶盘|安装盘|canopy|downrod|ceiling\s*pan/.test(lower)) return "结构件";
  if (/端子排|端子座|接线端子|电线|线组|端子线|连接线|terminal|wire|cable/.test(lower)) return "线材";
  if (/包装袋|塑胶袋|胶袋|po袋|p\.o袋|pe袋|p\.e袋|说明书|manual|instruction|bag/.test(lower)) return "包装";
  if (/铝基板|铝基线路板|al\s*pcb|mcpcb/.test(lower)) return "光源";
  if (/驱动|电源|控制器|遥控|接收器|电子|电子料|电阻|电容|芯片|pcb|pcba|电路|线路板|ic|mcu|resistor|capacitor|driver|power\s*supply|controller/.test(lower)) return "驱动/控制器";
  if (/线材|电线|电子线|电源线|插座|线夹|wire|cable/.test(lower)) return "线材";
  if (/光源|光电|灯珠|led|cob|铝基板/.test(lower)) return "光源";
  if (/包装|纸箱|彩盒|泡沫|泡棉|说明书|标签|外箱|carton|box|package/.test(lower)) return "包装";
  if (/五金|五金包|配件包|螺丝|螺母|垫片|扳手/.test(lower)) return "五金";
  if (/结构|外壳|壳体|铝|铁|钢|不锈钢|锌合金|合金|金属|玻璃|亚克力|支架|固定片|固定板|安装板|底座|底盘|灯体|塑件|塑胶|杆|管|框|边框|面罩|堵头|端盖|housing|case/.test(lower)) return "结构件";
  if (/脚垫|胶水|酒精|辅料|杂项|杂件/.test(lower)) return "杂项";
  if (/表面|喷涂|电镀|氧化|烤漆|处理|finish|coating/.test(lower)) return "结构件";
  if (/模具|治具|夹具|tooling|fixture|mold|物流|运输|损耗|运费|loss|freight|shipping/.test(lower)) return "杂项";
  return "杂项";
}

function coercePlatformCategory(category: string): string {
  if (SUMMARY_COST_CATEGORIES.has(category)) return category;
  if (STANDARD_MATERIAL_CATEGORIES.includes(category as (typeof STANDARD_MATERIAL_CATEGORIES)[number])) return category;
  if (category === "五金包") return "五金";
  if (category === "表面处理") return "结构件";
  return "杂项";
}

export function isSummaryCostItem(materialName: string, category = "", ...additionalLabels: unknown[]): boolean {
  const normalized = normalizeBomCategory([category, ...additionalLabels].filter(Boolean).join(" "), materialName);
  return ["材料成本合计", "人工", "人工/管理/利润", "出厂价"].includes(normalized);
}

type SummaryCostRowLike = {
  materialName: string;
  category?: string;
  manualCategory?: string;
  originalFields?: Record<string, unknown>;
  raw?: Record<string, unknown>;
};

export function isSummaryCostRow(row: SummaryCostRowLike): boolean {
  if (isSummaryCostItem(row.materialName, row.category ?? "", row.manualCategory ?? "")) return true;

  const metadata = [row.originalFields, row.raw];
  return metadata.some((fields) => {
    if (!fields) return false;
    const role = cleanText(fields.rowRole ?? fields["行类型"]).toLowerCase();
    if (/summary|subtotal|汇总|小计|合计|总计/.test(role)) return true;
    const label = cleanText(fields.summaryLabel ?? fields["汇总标签"]);
    return Boolean(label) && isSummaryCostItem(label);
  });
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
