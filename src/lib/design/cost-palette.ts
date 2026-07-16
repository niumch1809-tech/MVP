const CATEGORY_BASE_COLORS = [
  "#CC247C",
  "#E95351",
  "#F7A24F",
  "#FBEB66",
  "#4EA660",
  "#79CAFB",
  "#5292F7",
  "#AA77E9"
];

const CATEGORY_COLOR_INDEX: Record<string, number> = {
  结构件: 0,
  光源: 2,
  "驱动/控制器": 3,
  线材: 4,
  包装: 5,
  五金: 6,
  杂项: 7,
  人工: 1,
  表面处理: 0,
  "模具/治具": 6,
  "物流/损耗": 5,
  吊钟组: 0,
  吊杆组: 0,
  "端子排/端子座": 1,
  "电线/线组": 4,
  包装袋: 5,
  五金包: 6,
  说明书: 5,
  灯盘组: 0,
  叶片组: 0,
  电机: 3,
  "人工/管理/利润": 1,
  材料成本合计: 6,
  出厂价: 4,
  其他: 7
};

export const SUPPLIER_CHART_COLORS = [
  "#9677b8",
  "#e8d8fc",
  "#e31a1c",
  "#fb9a99",
  "#fdbf6f",
  "#b2df8a",
  "#33a02c"
];

export function getCostCategoryColor(category: string, fallbackIndex = 0): string {
  const key = category.trim();
  const directIndex = CATEGORY_COLOR_INDEX[key];
  if (directIndex !== undefined) {
    return CATEGORY_BASE_COLORS[directIndex % CATEGORY_BASE_COLORS.length];
  }

  const index = stableIndex(key, fallbackIndex);
  if (index < CATEGORY_BASE_COLORS.length) {
    return CATEGORY_BASE_COLORS[index];
  }

  return colorFromHue((index * 47 + fallbackIndex * 23) % 360, 70, 62);
}

export function getCostCategorySeriesColor(category: string, seriesIndex = 0): string {
  return adjustColor(getCostCategoryColor(category), seriesIndex);
}

export function getCostMaterialColor(value: string, category: string, fallbackIndex = 0): string {
  const variantIndex = stableIndex(value, fallbackIndex) % 7;
  return adjustColor(getCostCategoryColor(category, fallbackIndex), variantIndex);
}

export function getCostSeriesColor(value: string, fallbackIndex = 0): string {
  const index = stableIndex(value, fallbackIndex);
  return CATEGORY_BASE_COLORS[index % CATEGORY_BASE_COLORS.length];
}

function stableIndex(value: string, fallbackIndex = 0): number {
  const key = value.trim();
  if (!key) return fallbackIndex;

  let hash = fallbackIndex;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function adjustColor(hex: string, variantIndex: number): string {
  const hsl = hexToHsl(hex);
  const variants = [
    { saturation: 0, lightness: 0 },
    { saturation: -6, lightness: 8 },
    { saturation: -10, lightness: -7 },
    { saturation: -18, lightness: 14 },
    { saturation: 8, lightness: -12 },
    { saturation: -22, lightness: -2 },
    { saturation: 4, lightness: 10 }
  ];
  const variant = variants[variantIndex % variants.length];

  return colorFromHue(
    hsl.h,
    clamp(hsl.s + variant.saturation, 42, 86),
    clamp(hsl.l + variant.lightness, 38, 76)
  );
}

function hexToHsl(hex: string) {
  const normalized = hex.replace("#", "");
  const red = parseInt(normalized.slice(0, 2), 16) / 255;
  const green = parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness * 100 };
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (max === red) hue = ((green - blue) / delta) % 6;
  if (max === green) hue = (blue - red) / delta + 2;
  if (max === blue) hue = (red - green) / delta + 4;

  return {
    h: Math.round(hue * 60 + (hue < 0 ? 360 : 0)),
    s: saturation * 100,
    l: lightness * 100
  };
}

function colorFromHue(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness / 100 - 1)) * (saturation / 100);
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness / 100 - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue < 60) [red, green, blue] = [chroma, x, 0];
  else if (hue < 120) [red, green, blue] = [x, chroma, 0];
  else if (hue < 180) [red, green, blue] = [0, chroma, x];
  else if (hue < 240) [red, green, blue] = [0, x, chroma];
  else if (hue < 300) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];

  return `#${toHex(red + m)}${toHex(green + m)}${toHex(blue + m)}`;
}

function toHex(value: number) {
  return Math.round(clamp(value, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
