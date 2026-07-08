const materialAliases: Array<[RegExp, string]> = [
  [/电阻|resistor|res\b/i, "resistor"],
  [/电容|capacitor|cap\b/i, "capacitor"],
  [/芯片|ic|mcu|chip/i, "ic"],
  [/连接器|connector|conn/i, "connector"],
  [/螺丝|螺钉|screw/i, "screw"],
  [/灯珠|led/i, "led"],
  [/驱动|电源|driver|power supply/i, "driver"],
  [/外壳|壳体|housing|case/i, "housing"],
  [/透镜|lens/i, "lens"],
  [/pcb|电路板/i, "pcb"]
];

export function normalizeMaterialName(value: unknown): string {
  const text = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (!text) {
    return "";
  }

  const alias = materialAliases.find(([pattern]) => pattern.test(text));
  return alias ? alias[1] : text;
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
