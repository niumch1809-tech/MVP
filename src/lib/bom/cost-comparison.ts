import { CanonicalBomRow } from "@/types/bom";
import { isRollupCostRow, isSummaryCostItem, normalizeBomCategory } from "./normalize";

export const STANDARD_CATEGORIES = [
  "结构件",
  "电子料",
  "光源",
  "包装",
  "人工",
  "表面处理",
  "模具/治具",
  "物流/损耗",
  "吊钟组",
  "吊杆组",
  "端子排/端子座",
  "电线/线组",
  "包装袋",
  "五金包",
  "说明书",
  "灯盘组",
  "叶片组",
  "人工/管理/利润",
  "材料成本合计",
  "出厂价",
  "其他"
] as const;

const CATEGORY_MATCH_KEY_ONLY = new Set([
  "吊钟组",
  "吊杆组",
  "端子排/端子座",
  "电线/线组",
  "包装袋",
  "五金包",
  "说明书",
  "灯盘组",
  "叶片组"
]);

export type CostFilters = {
  supplierNames: string[];
  productName: string;
  category: string;
  materialQuery: string;
};

export type SupplierTotal = {
  supplierName: string;
  totalAmount: number;
  rowCount: number;
};

export type CategoryComparisonRow = {
  category: string;
  totalAmount: number;
  rows: CanonicalBomRow[];
} & Record<string, string | number | CanonicalBomRow[]>;

export type SupplierPricePoint = {
  supplierName: string;
  unitPrice: number;
  amount: number;
  quantity: number;
  row: CanonicalBomRow;
};

export type MaterialComparisonItem = {
  id: string;
  productName: string;
  materialName: string;
  matchKey: string;
  category: string;
  minPrice: number;
  maxPrice: number;
  diffAmount: number;
  diffRate: number;
  suppliers: SupplierPricePoint[];
  rows: CanonicalBomRow[];
};

export type CostTotals = {
  materialTotals: Record<string, number>;
  overheadTotals: Record<string, number>;
  factoryPriceTotals: Record<string, number>;
  derivedOverheadTotals: Record<string, number>;
};

export type CostComparison = {
  filteredRows: CanonicalBomRow[];
  supplierTotals: SupplierTotal[];
  categoryComparison: CategoryComparisonRow[];
  materialComparisons: MaterialComparisonItem[];
  categories: string[];
  products: string[];
  suppliers: string[];
  activeSuppliers: string[];
  totals: CostTotals;
};

export function buildCostComparison(rows: CanonicalBomRow[], filters: CostFilters): CostComparison {
  const quoteRows = rows.filter((row) => row.kind === "supplier_quote");
  const products = uniqueSorted(quoteRows.map((row) => row.productName).filter(Boolean));
  const suppliers = uniqueSorted(quoteRows.map((row) => row.supplierName).filter(Boolean));
  const activeSuppliers =
    filters.supplierNames.length > 0 ? suppliers.filter((supplier) => filters.supplierNames.includes(supplier)) : suppliers;
  const filteredRows = quoteRows.filter((row) => matchesFilters(row, filters));
  const comparableRows = filteredRows.filter(isComparableCostRow);

  return {
    filteredRows,
    supplierTotals: buildSupplierTotals(filteredRows, activeSuppliers),
    categoryComparison: buildCategoryComparison(comparableRows, activeSuppliers),
    materialComparisons: buildMaterialComparisons(comparableRows, activeSuppliers),
    categories: buildCategories(comparableRows),
    products,
    suppliers,
    activeSuppliers,
    totals: buildCostTotals(filteredRows, activeSuppliers)
  };
}

export function normalizeCostCategory(category: string, materialName = ""): string {
  return normalizeBomCategory(category, materialName);
}

function matchesFilters(row: CanonicalBomRow, filters: CostFilters): boolean {
  const category = getEffectiveCategory(row);
  const materialText = `${row.materialName} ${row.normalizedName} ${row.manualName ?? ""} ${row.spec}`.toLowerCase();
  const query = filters.materialQuery.trim().toLowerCase();

  return (
    (filters.supplierNames.length === 0 || filters.supplierNames.includes(row.supplierName)) &&
    (!filters.productName || row.productName === filters.productName) &&
    (!filters.category || category === filters.category) &&
    (!query || materialText.includes(query))
  );
}

function buildSupplierTotals(rows: CanonicalBomRow[], suppliers: string[]): SupplierTotal[] {
  return suppliers
    .map((supplierName) => {
      const supplierRows = rows.filter((row) => row.supplierName === supplierName);
      const factory = supplierRows
        .filter((row) => getEffectiveCategory(row) === "出厂价")
        .reduce((sum, row) => sum + row.amount, 0);
      const overhead = supplierRows
        .filter((row) => ["人工", "人工/管理/利润"].includes(getEffectiveCategory(row)) && !isRollupCostRow(row.materialName, row.category))
        .reduce((sum, row) => sum + row.amount, 0);
      const materialDetail = supplierRows.filter(isComparableCostRow).reduce((sum, row) => sum + row.amount, 0);

      return {
        supplierName,
        totalAmount: factory || materialDetail + overhead,
        rowCount: supplierRows.length
      };
    })
    .filter((item) => item.rowCount > 0)
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

function buildCategoryComparison(rows: CanonicalBomRow[], suppliers: string[]): CategoryComparisonRow[] {
  return buildCategories(rows).map((category) => {
    const categoryRows = rows.filter((row) => getEffectiveCategory(row) === category);
    const result: CategoryComparisonRow = {
      category,
      totalAmount: categoryRows.reduce((sum, row) => sum + row.amount, 0),
      rows: categoryRows
    };

    suppliers.forEach((supplier) => {
      result[supplier] = categoryRows
        .filter((row) => row.supplierName === supplier)
        .reduce((sum, row) => sum + row.amount, 0);
    });

    return result;
  }).filter((row) => row.totalAmount > 0);
}

function buildMaterialComparisons(rows: CanonicalBomRow[], suppliers: string[]): MaterialComparisonItem[] {
  const groups = new Map<string, CanonicalBomRow[]>();
  rows
    .filter((row) => row.materialName.trim())
    .forEach((row) => {
      const materialKey = buildMaterialMatchKey(row);
      const key = `${row.productName || "未命名产品"}::${materialKey}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    });

  return Array.from(groups.entries())
    .map(([key, materialRows]) => {
      const productName = materialRows[0].productName || "未命名产品";
      const supplierPoints = suppliers
        .map((supplierName) => {
          const supplierRows = materialRows.filter((row) => row.supplierName === supplierName);
          if (supplierRows.length === 0) return null;
          const amount = supplierRows.reduce((sum, row) => sum + row.amount, 0);
          const quantity = supplierRows.reduce((sum, row) => sum + row.quantity, 0);
          const unitPrice = quantity > 0 ? amount / quantity : Math.max(...supplierRows.map((row) => row.unitPrice));
          return {
            supplierName,
            unitPrice,
            amount,
            quantity,
            row: supplierRows[0]
          };
        })
        .filter((point): point is SupplierPricePoint => point !== null);

      const positivePrices = supplierPoints.map((point) => point.unitPrice).filter((price) => price > 0);
      const minPrice = positivePrices.length > 0 ? Math.min(...positivePrices) : 0;
      const maxPrice = positivePrices.length > 0 ? Math.max(...positivePrices) : 0;

      return {
        id: key,
        productName,
        materialName: buildDisplayMaterialName(materialRows),
        matchKey: buildMaterialMatchKey(materialRows[0]),
        category: getEffectiveCategory(materialRows[0]),
        minPrice,
        maxPrice,
        diffAmount: maxPrice - minPrice,
        diffRate: minPrice > 0 ? maxPrice / minPrice - 1 : 0,
        suppliers: supplierPoints,
        rows: materialRows
      };
    })
    .sort((a, b) => b.diffAmount - a.diffAmount || b.maxPrice - a.maxPrice);
}

function isComparableCostRow(row: CanonicalBomRow): boolean {
  return row.amount > 0 && !isSummaryCostItem(row.materialName, row.category) && !isRollupCostRow(row.materialName, row.category);
}

function buildMaterialMatchKey(row: CanonicalBomRow): string {
  if (row.manualMatchKey) {
    return row.manualMatchKey;
  }
  const category = getEffectiveCategory(row);
  const base = row.normalizedName || row.materialName.trim();
  if (CATEGORY_MATCH_KEY_ONLY.has(category)) {
    return `${category}::同类部件`;
  }
  if (category !== "其他" && /^[\p{Script=Han}a-z0-9/]+$/iu.test(base)) {
    return `${category}::${base}`;
  }
  return base;
}

function buildDisplayMaterialName(rows: CanonicalBomRow[]): string {
  const first = rows[0];
  if (first.manualName?.trim()) {
    return first.manualName.trim();
  }
  const normalized = first.normalizedName || first.materialName.trim();
  const originals = Array.from(new Set(rows.map((row) => row.materialName.trim()).filter(Boolean)));
  if (originals.length > 1) {
    return `${normalized}（${originals.slice(0, 3).join(" / ")}${originals.length > 3 ? "..." : ""}）`;
  }
  return normalized || originals[0] || "未命名物料";
}

function buildCategories(rows: CanonicalBomRow[]): string[] {
  const dynamic = uniqueSorted(rows.map((row) => getEffectiveCategory(row)).filter(Boolean));
  const canonicalOrder = STANDARD_CATEGORIES.slice();
  return [
    ...canonicalOrder.filter((category) => dynamic.includes(category)),
    ...dynamic.filter((category) => !canonicalOrder.includes(category as (typeof STANDARD_CATEGORIES)[number]))
  ];
}

function getEffectiveCategory(row: CanonicalBomRow): string {
  return row.manualCategory?.trim() || normalizeCostCategory(row.category, row.materialName);
}

function buildCostTotals(rows: CanonicalBomRow[], suppliers: string[]): CostTotals {
  const materialTotals: Record<string, number> = {};
  const overheadTotals: Record<string, number> = {};
  const factoryPriceTotals: Record<string, number> = {};
  const derivedOverheadTotals: Record<string, number> = {};

  suppliers.forEach((supplier) => {
    const supplierRows = rows.filter((row) => row.supplierName === supplier);
    const materialSummary = supplierRows
      .filter((row) => getEffectiveCategory(row) === "材料成本合计")
      .reduce((sum, row) => sum + row.amount, 0);
    const materialDetail = supplierRows
      .filter(isComparableCostRow)
      .reduce((sum, row) => sum + row.amount, 0);
    const overhead = supplierRows
      .filter((row) => ["人工", "人工/管理/利润"].includes(getEffectiveCategory(row)) && !isRollupCostRow(row.materialName, row.category))
      .reduce((sum, row) => sum + row.amount, 0);
    const factory = supplierRows
      .filter((row) => getEffectiveCategory(row) === "出厂价")
      .reduce((sum, row) => sum + row.amount, 0);

    materialTotals[supplier] = materialSummary || materialDetail;
    overheadTotals[supplier] = overhead;
    factoryPriceTotals[supplier] = factory;
    derivedOverheadTotals[supplier] = overhead || (factory > 0 ? Math.max(factory - materialTotals[supplier], 0) : 0);
  });

  return { materialTotals, overheadTotals, factoryPriceTotals, derivedOverheadTotals };
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "zh-CN"));
}
