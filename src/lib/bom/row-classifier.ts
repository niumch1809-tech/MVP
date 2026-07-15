import { scoreHeaderRow } from "./field-map";
import { hasValue, toNumber } from "./normalize";

export type ComplexBomRowType = "blank" | "header" | "section_title" | "subtotal" | "material" | "unknown";

export type ComplexBomRowClassification = {
  type: ComplexBomRowType;
  reason: string;
};

const SECTION_TITLE_PATTERN = /(?:灯体|结构|配光|包装|光源|电子|五金|电机|驱动|控制|遥控|配件|辅料|人工|管理|利润|物流|损耗|表面处理|模具|治具|材料|底盘|面罩|遥控器)\s*(?:部分|部份|件|料|包|组)?$/i;
const SUBTOTAL_PATTERN = /(?:材料成本合计|物料成本|原材料成本|人工.*管理.*利润|人工费|管理费|利润|毛利|损耗|杂费|附加费|费用|核验总成本|最终合计|出厂价|工厂价|小计|合计|总计|汇总|成本合计|部分成本|成本)$/i;
const ADMIN_STAMP_PATTERN = /^(?:编制|制表|审核|复核|批准|审批|核准|确认|日期|报价日期|客户|项目|公司|电话|传真|联系人)[:：]?.*$/i;

export function classifyComplexBomRow(cells: unknown[]): ComplexBomRowClassification {
  const values = cells.map((cell) => String(cell ?? "").trim());
  const nonEmpty = values.filter(Boolean);
  if (nonEmpty.length === 0) {
    return { type: "blank", reason: "空行" };
  }

  const headerScore = scoreHeaderRow(values);
  if (headerScore >= 3) {
    return { type: "header", reason: `识别到 ${headerScore} 个 BOM 字段` };
  }

  const uniqueText = Array.from(new Set(nonEmpty));
  const rowText = uniqueText.join(" ");
  const numericCount = values.filter((value) => toNumber(value) > 0).length;
  const hasQuantityLikeNumber = numericCount > 0;

  if (isAdministrativeStampText(rowText)) {
    return { type: "unknown", reason: "审批/制表/客户信息行，非 BOM 物料或品类" };
  }

  if (isSubtotalText(rowText)) {
    return { type: "subtotal", reason: "包含小计/合计/成本汇总关键词" };
  }

  if (uniqueText.length <= 3 && numericCount <= 1 && isSectionTitleText(rowText)) {
    return { type: "section_title", reason: "少量文本单元格且匹配 BOM 分段标题" };
  }

  if (nonEmpty.length >= 2 && hasQuantityLikeNumber) {
    return { type: "material", reason: "包含文本和数值，可能是物料明细" };
  }

  if (nonEmpty.some(hasValue) && numericCount >= 2) {
    return { type: "material", reason: "包含多个数值字段，可能是物料明细" };
  }

  return { type: "unknown", reason: "无法稳定归类为表头、分段、小计或物料" };
}

export function isSubtotalText(value: string): boolean {
  const normalized = value.replace(/\s+/g, "");
  return SUBTOTAL_PATTERN.test(normalized);
}

export function isAdministrativeStampText(value: string): boolean {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized) return false;
  return ADMIN_STAMP_PATTERN.test(normalized);
}

export function isSectionTitleText(value: string): boolean {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized) return false;
  if (/^\d/.test(normalized)) return false;
  return SECTION_TITLE_PATTERN.test(normalized) || /(?:部分|部份)$/.test(normalized);
}
