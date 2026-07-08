import { CanonicalBomRow } from "@/types/bom";

export const STANDARD_CATEGORIES = [
  "结构件",
  "电子料",
  "光源",
  "包装",
  "人工",
  "表面处理",
  "模具/治具",
  "物流/损耗",
  "其他"
] as const;

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
  category: string;
  minPrice: number;
  maxPrice: number;
  diffAmount: number;
  diffRate: number;
  suppliers: SupplierPricePoint[];
  rows: CanonicalBomRow[];
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
};

export function buildCostComparison(rows: CanonicalBomRow[], filters: CostFilters): CostComparison {
  const quoteRows = rows.filter((row) => row.kind === "supplier_quote");
  const products = uniqueSorted(quoteRows.map((row) => row.productName).filter(Boolean));
  const suppliers = uniqueSorted(quoteRows.map((row) => row.supplierName).filter(Boolean));
  const activeSuppliers =
    filters.supplierNames.length > 0 ? suppliers.filter((supplier) => filters.supplierNames.includes(supplier)) : suppliers;
  const filteredRows = quoteRows.filter((row) => matchesFilters(row, filters));

  return {
    filteredRows,
    supplierTotals: buildSupplierTotals(filteredRows),
    categoryComparison: buildCategoryComparison(filteredRows, activeSuppliers),
    materialComparisons: buildMaterialComparisons(filteredRows, activeSuppliers),
    categories: STANDARD_CATEGORIES.slice(),
    products,
    suppliers,
    activeSuppliers
  };
}

export function normalizeCostCategory(category: string, materialName = ""): string {
  const text = `${category} ${materialName}`.toLowerCase();
  if (/结构|外壳|壳体|铝|五金|支架|灯体|塑件|housing|case/.test(text)) return "结构件";
  if (/电子|电阻|电容|芯片|驱动|电源|控制器|线材|pcb|ic|mcu|driver|resistor|capacitor/.test(text)) return "电子料";
  if (/光源|光电|灯珠|led|cob|铝基板/.test(text)) return "光源";
  if (/包装|纸箱|彩盒|泡沫|泡棉|说明书|标签|外箱|carton|box|package/.test(text)) return "包装";
  if (/人工|工时|组装|装配|labor/.test(text)) return "人工";
  if (/表面|喷涂|电镀|氧化|烤漆|处理|finish|coating/.test(text)) return "表面处理";
  if (/模具|治具|夹具|tooling|fixture|mold/.test(text)) return "模具/治具";
  if (/物流|运输|损耗|运费|loss|freight|shipping/.test(text)) return "物流/损耗";
  return "其他";
}

function matchesFilters(row: CanonicalBomRow, filters: CostFilters): boolean {
  const category = normalizeCostCategory(row.category, row.materialName);
  const materialText = `${row.materialName} ${row.normalizedName} ${row.spec}`.toLowerCase();
  const query = filters.materialQuery.trim().toLowerCase();

  return (
    (filters.supplierNames.length === 0 || filters.supplierNames.includes(row.supplierName)) &&
    (!filters.productName || row.productName === filters.productName) &&
    (!filters.category || category === filters.category) &&
    (!query || materialText.includes(query))
  );
}

function buildSupplierTotals(rows: CanonicalBomRow[]): SupplierTotal[] {
  const groups = new Map<string, SupplierTotal>();
  rows.forEach((row) => {
    const current = groups.get(row.supplierName) ?? {
      supplierName: row.supplierName,
      totalAmount: 0,
      rowCount: 0
    };
    current.totalAmount += row.amount;
    current.rowCount += 1;
    groups.set(row.supplierName, current);
  });
  return Array.from(groups.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}

function buildCategoryComparison(rows: CanonicalBomRow[], suppliers: string[]): CategoryComparisonRow[] {
  return STANDARD_CATEGORIES.map((category) => {
    const categoryRows = rows.filter((row) => normalizeCostCategory(row.category, row.materialName) === category);
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
      const key = `${row.productName || "未命名产品"}::${row.materialName.trim()}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    });

  return Array.from(groups.entries())
    .map(([key, materialRows]) => {
      const materialName = materialRows[0].materialName.trim() || key;
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
        materialName,
        category: normalizeCostCategory(materialRows[0].category, materialName),
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

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "zh-CN"));
}
