import { BomFieldKey, BomFieldMapping } from "@/types/bom";

const aliases: Record<BomFieldKey, string[]> = {
  partNumber: [
    "part number",
    "part no",
    "part",
    "pn",
    "item code",
    "material code",
    "料号",
    "物料编码",
    "材料编码",
    "编码",
    "货号"
  ],
  materialName: [
    "material",
    "material name",
    "item name",
    "name",
    "description",
    "物料",
    "物料名称",
    "材料名称",
    "项目名称",
    "名称",
    "品名",
    "部件名称",
    "配件名称",
    "组件名称",
    "子件名称",
    "子件",
    "组件",
    "零件名称",
    "零件",
    "部品名称",
    "标的名称",
    "父件名称",
    "父项名称",
    "型号名称",
    "型号描述",
    "名称及规格",
    "材料及规格",
    "主要的内部构成件",
    "内部构成件",
    "构成件"
  ],
  spec: [
    "spec",
    "specification",
    "model",
    "型号",
    "规格",
    "规格型号",
    "规格/型号",
    "型号规格",
    "描述",
    "规格描述",
    "参数",
    "尺寸",
    "材质",
    "物料描述"
  ],
  category: ["category", "type", "class", "品类", "类别", "分类", "物料类别", "材料类别", "主要构成部分", "构成部分"],
  unit: ["unit", "uom", "单位", "计量单位"],
  quantity: ["qty", "quantity", "usage", "num", "用量", "数量", "个数", "件数", "数量/套", "用量/套", "需求数量", "单套用量", "单台用量", "单机用量"],
  unitPrice: [
    "unit price",
    "price",
    "quote",
    "quotation",
    "单价",
    "报价",
    "单价rmb",
    "单价/pcs",
    "单价/个",
    "价格",
    "价格/pcs",
    "rmb单价",
    "含税单价",
    "未税单价",
    "采购单价"
  ],
  amount: [
    "amount",
    "total",
    "total price",
    "subtotal",
    "金额",
    "总价",
    "合计",
    "小计",
    "总金额",
    "报价金额",
    "成本",
    "材料成本",
    "材料成本合计",
    "材料合计"
  ],
  remark: ["remark", "remarks", "note", "notes", "comment", "备注", "说明", "备注说明"],
  currency: ["currency", "币种", "货币"]
};

export function mapHeader(headers: string[]): BomFieldMapping {
  // Excel rows can be sparse when a formatted table contains blank columns.
  // Array#find visits those holes as `undefined`, so build a dense header list
  // before matching instead of assuming every array position contains a value.
  const normalizedHeaders = Array.from({ length: headers.length }, (_, index) => {
    const original = String(headers[index] ?? "");
    return {
      original,
      normalized: normalizeHeader(original)
    };
  });

  const result: BomFieldMapping = {};
  for (const [field, candidates] of Object.entries(aliases) as Array<[BomFieldKey, string[]]>) {
    const found = normalizedHeaders.find((header) =>
      candidates.some((candidate) => isHeaderMatch(header.normalized, normalizeHeader(candidate)))
    );
    if (found) {
      result[field] = found.original;
    }
  }

  return result;
}

export function scoreHeaderRow(cells: unknown[]): number {
  const headers = Array.from({ length: cells.length }, (_, index) => String(cells[index] ?? ""));
  const mapping = mapHeader(headers);
  return Object.keys(mapping).length;
}

function isHeaderMatch(header: string, candidate: string): boolean {
  if (!header || !candidate) {
    return false;
  }

  if (header === candidate) return true;

  // These short labels are meaningful only as complete headers. Treating
  // "规格说明" as "说明/备注", for example, maps one column to two fields.
  if (["name", "名称", "描述", "说明", "规格", "型号", "备注"].includes(candidate)) {
    return false;
  }

  return header.includes(candidate);
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[\s_\-\/\\:：]+/g, "")
    .replace(/[￥¥$]/g, "")
    .replace(/rmb|cny|人民币/gi, "rmb");
}
