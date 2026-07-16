import { CanonicalBomRow } from "@/types/bom";
import { isRollupCostRow, isSummaryCostItem, normalizeBomCategory } from "./normalize";

export const STANDARD_CATEGORIES = [
  "结构件",
  "光源",
  "驱动/控制器",
  "线材",
  "包装",
  "五金",
  "人工",
  "表面处理",
  "模具/治具",
  "物流/损耗",
  "五金包",
  "叶片组",
  "电机",
  "杂项",
  "人工/管理/利润",
  "材料成本合计",
  "出厂价",
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
  matchKey: string;
  supplierMaterialNames: Record<string, string>;
  supplierSpecs: Record<string, string>;
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
  const filterContext = buildFilterContext(filters);
  const filteredRows = quoteRows.filter((row) => matchesFilters(row, filters, filterContext));
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

function buildFilterContext(filters: CostFilters) {
  return {
    supplierNames: new Set(filters.supplierNames),
    query: filters.materialQuery.trim().toLowerCase()
  };
}

function matchesFilters(
  row: CanonicalBomRow,
  filters: CostFilters,
  context: ReturnType<typeof buildFilterContext>
): boolean {
  const category = getEffectiveCategory(row);
  const materialText = `${row.materialName} ${row.normalizedName} ${row.manualName ?? ""} ${row.spec}`.toLowerCase();
  const query = context.query;

  return (
    (context.supplierNames.size === 0 || context.supplierNames.has(row.supplierName)) &&
    (!filters.productName || row.productName === filters.productName) &&
    (!filters.category || category === filters.category) &&
    (!query || materialText.includes(query))
  );
}

function buildSupplierTotals(rows: CanonicalBomRow[], suppliers: string[]): SupplierTotal[] {
  const rowsBySupplier = groupRowsBy(rows, (row) => row.supplierName);
  return suppliers
    .map((supplierName) => {
      const supplierRows = rowsBySupplier.get(supplierName) ?? [];
      const totals = buildSupplierCostTotals(supplierRows);

      return {
        supplierName,
        totalAmount: totals.factoryPrice || totals.materialTotal + totals.derivedOverhead,
        rowCount: supplierRows.length
      };
    })
    .filter((item) => item.rowCount > 0)
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

function buildCategoryComparison(rows: CanonicalBomRow[], suppliers: string[]): CategoryComparisonRow[] {
  const categoryMap = new Map<string, CategoryComparisonRow>();

  rows.forEach((row) => {
    const category = getEffectiveCategory(row);
    const current =
      categoryMap.get(category) ??
      ({
        category,
        totalAmount: 0,
        rows: []
      } as CategoryComparisonRow);

    current.totalAmount += row.amount;
    current.rows.push(row);
    current[row.supplierName] = Number(current[row.supplierName] ?? 0) + row.amount;
    categoryMap.set(category, current);
  });

  return Array.from(categoryMap.values())
    .map((row) => {
      suppliers.forEach((supplier) => {
        row[supplier] = Number(row[supplier] ?? 0);
      });
      return row;
    })
    .filter((row) => row.totalAmount > 0)
    .sort((a, b) => b.totalAmount - a.totalAmount || a.category.localeCompare(b.category, "zh-CN"));
}

function buildMaterialComparisons(rows: CanonicalBomRow[], suppliers: string[]): MaterialComparisonItem[] {
  const groups = new Map<string, CanonicalBomRow[]>();
  rows
    .filter((row) => row.materialName.trim())
    .forEach((row) => {
      const key = buildMaterialMatchKey(row);
      const group = groups.get(key);
      if (group) {
        group.push(row);
      } else {
        groups.set(key, [row]);
      }
    });

  return Array.from(groups.entries())
    .map(([key, materialRows]) => {
      const rowsBySupplier = groupRowsBy(materialRows, (row) => row.supplierName);
      const supplierPoints = suppliers
        .map((supplierName) => {
          const supplierRows = rowsBySupplier.get(supplierName) ?? [];
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
        productName: buildDisplayProductName(materialRows),
        materialName: buildDisplayMaterialName(materialRows),
        matchKey: buildMaterialMatchKey(materialRows[0]),
        supplierMaterialNames: buildSupplierMaterialNames(rowsBySupplier, suppliers),
        supplierSpecs: buildSupplierSpecs(rowsBySupplier, suppliers),
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
  return buildMaterialIdentity(row);
}

function groupRowsBy(rows: CanonicalBomRow[], getKey: (row: CanonicalBomRow) => string): Map<string, CanonicalBomRow[]> {
  const groups = new Map<string, CanonicalBomRow[]>();
  rows.forEach((row) => {
    const key = getKey(row);
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  });
  return groups;
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

function buildDisplayProductName(rows: CanonicalBomRow[]): string {
  const labels = Array.from(
    new Set(
      rows
        .map((row) => [row.productName, row.productModel, row.productColor].filter(Boolean).join(" / ").trim())
        .filter(Boolean)
    )
  );
  if (labels.length === 0) return "未指定产品";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, 3).join(" / ")}${labels.length > 3 ? "..." : ""}`;
}

function buildSupplierMaterialNames(rowsBySupplier: Map<string, CanonicalBomRow[]>, suppliers: string[]): Record<string, string> {
  return Object.fromEntries(
    suppliers.map((supplier) => {
      const names = Array.from(
        new Set(
          (rowsBySupplier.get(supplier) ?? [])
            .map((row) => row.materialName.trim())
            .filter(Boolean)
        )
      );
      return [supplier, names.join(" / ")];
    })
  );
}

function buildSupplierSpecs(rowsBySupplier: Map<string, CanonicalBomRow[]>, suppliers: string[]): Record<string, string> {
  return Object.fromEntries(
    suppliers.map((supplier) => {
      const specs = Array.from(
        new Set(
          (rowsBySupplier.get(supplier) ?? [])
            .map((row) => row.spec.trim())
            .filter(Boolean)
        )
      );
      return [supplier, specs.join(" / ")];
    })
  );
}

function buildMaterialIdentity(row: CanonicalBomRow): string {
  const manual = normalizeLooseMaterialText(row.manualName || "");
  const normalized = stripSpecFingerprint(row.normalizedName || "");
  const fallback = normalizeLooseMaterialText(row.materialName);
  return manual || normalized || fallback || row.materialName.trim();
}

function stripSpecFingerprint(value: string): string {
  return value.split("|")[0]?.trim() ?? "";
}

function normalizeLooseMaterialText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9/]+/giu, "")
    .slice(0, 64);
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
  const rowsBySupplier = groupRowsBy(rows, (row) => row.supplierName);

  suppliers.forEach((supplier) => {
    const supplierRows = rowsBySupplier.get(supplier) ?? [];
    const totals = buildSupplierCostTotals(supplierRows);

    materialTotals[supplier] = totals.materialTotal;
    overheadTotals[supplier] = totals.explicitOverhead;
    factoryPriceTotals[supplier] = totals.factoryPrice;
    derivedOverheadTotals[supplier] = totals.derivedOverhead;
  });

  return { materialTotals, overheadTotals, factoryPriceTotals, derivedOverheadTotals };
}

function buildSupplierCostTotals(rows: CanonicalBomRow[]): {
  materialTotal: number;
  explicitOverhead: number;
  factoryPrice: number;
  derivedOverhead: number;
} {
  const materialDetail = rows.filter(isComparableCostRow).reduce((sum, row) => sum + row.amount, 0);
  const materialSummary = pickSingleSummaryAmount(rows.filter((row) => getEffectiveCategory(row) === "材料成本合计"));
  const explicitOverhead =
    rows
      .filter((row) => ["人工", "人工/管理/利润"].includes(getEffectiveCategory(row)) && !isRollupCostRow(row.materialName, row.category))
      .reduce((sum, row) => sum + row.amount, 0) + sumAdditionalOverheadColumns(rows);
  const factoryPrice = pickSingleSummaryAmount(rows.filter((row) => getEffectiveCategory(row) === "出厂价"));

  const materialTotal = chooseMaterialTotal({ materialSummary, materialDetail, factoryPrice });
  const derivedOverhead = explicitOverhead || (factoryPrice > 0 ? Math.max(factoryPrice - materialTotal, 0) : 0);

  return { materialTotal, explicitOverhead, factoryPrice, derivedOverhead };
}

function chooseMaterialTotal(input: { materialSummary: number; materialDetail: number; factoryPrice: number }): number {
  const { materialSummary, materialDetail, factoryPrice } = input;
  if (materialSummary <= 0) return materialDetail;

  // 成本表的三层口径：材料成本是独立层级，优先信任明确的“材料成本/物料成本合计”。
  // 只有当它明显等于或超过最终报价，且明细材料更合理时，才回退到明细汇总。
  const summaryLooksLikeFinalPrice = factoryPrice > 0 && materialSummary >= factoryPrice;
  const detailLooksUsable = materialDetail > 0 && (factoryPrice <= 0 || materialDetail < factoryPrice);
  if (summaryLooksLikeFinalPrice && detailLooksUsable) return materialDetail;

  return materialSummary;
}

function pickSingleSummaryAmount(rows: CanonicalBomRow[]): number {
  const values = rows.map((row) => row.amount).filter((value) => value > 0);
  if (values.length === 0) return 0;
  return Math.max(...values);
}

function sumAdditionalOverheadColumns(rows: CanonicalBomRow[]): number {
  const seen = new Set<string>();
  return rows.reduce((sum, row) => {
    if (isSummaryCostItem(row.materialName, row.category) || isRollupCostRow(row.materialName, row.category)) return sum;
    return sum + Object.entries(row.originalFields ?? {}).reduce((fieldSum, [fieldName, rawValue]) => {
      if (!isAdditionalOverheadField(fieldName)) return fieldSum;
      const value = toLooseNumber(rawValue);
      if (value <= 0) return fieldSum;
      const dedupeKey = `${row.sourceFileId}|${row.sheetName}|${row.supplierName}|${fieldName}|${row.rowNumber}|${value}`;
      if (seen.has(dedupeKey)) return fieldSum;
      seen.add(dedupeKey);
      return fieldSum + value;
    }, 0);
  }, 0);
}

function isAdditionalOverheadField(fieldName: string): boolean {
  const normalized = fieldName.trim().toLowerCase();
  if (!normalized) return false;
  if (/出厂价|工厂价|最终合计|核验总成本|材料成本|材料合计|物料合计|合计|小计|总价|金额|amount|total|subtotal/.test(normalized)) {
    return false;
  }
  return /人工|工时|管理|利润|毛利|损耗|杂费|附加费|服务费|装配费|加工费|overhead|profit|labor|fee|loss/.test(normalized);
}

function toLooseNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[,，￥¥$]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

