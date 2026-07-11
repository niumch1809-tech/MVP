const canonicalMaterialRules: Array<{ pattern: RegExp; name: string; category?: string; ignoreSpec?: boolean }> = [
  { pattern: /吊钟组|吊钟|吊盅/i, name: "吊钟组", category: "吊钟组", ignoreSpec: true },
  { pattern: /吊杆组|吊杆|吊管/i, name: "吊杆组", category: "吊杆组", ignoreSpec: true },
  { pattern: /端子排|端子座/i, name: "端子排/端子座", category: "端子排/端子座", ignoreSpec: true },
  { pattern: /电线|线组|地线|黄绿线|线材|导线|端子线|wire|cable/i, name: "电线/线组", category: "电线/线组", ignoreSpec: true },
  { pattern: /塑胶袋|po袋|p\.?o\.?袋|pe袋|p\.?e\.?袋/i, name: "包装袋", category: "包装袋", ignoreSpec: true },
  { pattern: /五金包组|五金包/i, name: "五金包", category: "五金包", ignoreSpec: true },
  { pattern: /说明书组|说明书|manual/i, name: "说明书", category: "说明书", ignoreSpec: true },
  { pattern: /灯盘组|灯盘/i, name: "灯盘组", category: "灯盘组", ignoreSpec: true },
  { pattern: /叶片组|叶片|扇叶/i, name: "叶片组", category: "叶片组", ignoreSpec: true },
  { pattern: /人工管理费|人工\/管理|人工及管理|人工管理利润|人工\/管理\/利润/i, name: "人工/管理/利润", category: "人工/管理/利润", ignoreSpec: true },
  { pattern: /人工|工时|组装|装配|labor/i, name: "人工", category: "人工", ignoreSpec: true },
  { pattern: /管理费|管理|overhead/i, name: "管理费", category: "人工/管理/利润", ignoreSpec: true },
  { pattern: /利润|毛利|profit/i, name: "利润", category: "人工/管理/利润", ignoreSpec: true },
  { pattern: /出厂价|工厂价|含税出厂|factory/i, name: "出厂价", category: "出厂价", ignoreSpec: true },
  { pattern: /材料成本合计|材料合计|物料合计|bom合计|总材料/i, name: "材料成本合计", category: "材料成本合计", ignoreSpec: true },
  { pattern: /电阻|resistor|res\b/i, name: "resistor" },
  { pattern: /电容|capacitor|cap\b/i, name: "capacitor" },
  { pattern: /芯片|ic|mcu|chip/i, name: "ic" },
  { pattern: /连接器|connector|conn/i, name: "connector" },
  { pattern: /螺丝|螺钉|screw/i, name: "screw", category: "五金包" },
  { pattern: /螺母|螺帽|nut/i, name: "nut", category: "五金包" },
  { pattern: /垫片|washer/i, name: "washer", category: "五金包" },
  { pattern: /灯珠|led/i, name: "led", category: "光源" },
  { pattern: /光源|cob/i, name: "led", category: "光源" },
  { pattern: /驱动|电源|driver|power supply/i, name: "driver", category: "电子料" },
  { pattern: /外壳|壳体|housing|case/i, name: "housing", category: "结构件" },
  { pattern: /铝件|铝壳|散热器|heatsink/i, name: "housing", category: "结构件" },
  { pattern: /透镜|lens/i, name: "lens", category: "光源" },
  { pattern: /扩散板|扩散罩|diffuser/i, name: "diffuser", category: "光源" },
  { pattern: /pcb|电路板|铝基板/i, name: "pcb", category: "电子料" },
  { pattern: /纸箱|彩盒|包装盒|外箱|carton|box/i, name: "package", category: "包装" },
  { pattern: /泡棉|泡沫|foam/i, name: "foam", category: "包装" },
  { pattern: /标签|label/i, name: "label", category: "包装" }
];

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
  const canonicalRule = findCanonicalMaterialRule(baseText);
  const normalizedBase = canonicalRule?.name ?? normalizeMaterialBase(baseText);
  const specFingerprint = canonicalRule?.ignoreSpec ? "" : normalizeSpecFingerprint(extractedSpec);
  const normalizedName = [normalizedBase, specFingerprint].filter(Boolean).join("|");

  return {
    materialName: materialName || rawName || merged,
    spec: extractedSpec,
    normalizedName
  };
}

export function normalizeBomCategory(categoryValue: unknown, materialNameValue: unknown = ""): string {
  const text = cleanText(`${categoryValue ?? ""} ${materialNameValue ?? ""}`);
  const canonicalRule = findCanonicalMaterialRule(text);
  if (canonicalRule?.category) return canonicalRule.category;

  const lower = text.toLowerCase();
  if (/结构|外壳|壳体|铝|五金|支架|灯体|塑件|housing|case/.test(lower)) return "结构件";
  if (/电子|电阻|电容|芯片|驱动|电源|控制器|线材|pcb|ic|mcu|driver|resistor|capacitor/.test(lower)) return "电子料";
  if (/光源|光电|灯珠|led|cob|铝基板/.test(lower)) return "光源";
  if (/包装|纸箱|彩盒|泡沫|泡棉|说明书|标签|外箱|carton|box|package/.test(lower)) return "包装";
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

function findCanonicalMaterialRule(value: string) {
  return canonicalMaterialRules.find((rule) => rule.pattern.test(value));
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
