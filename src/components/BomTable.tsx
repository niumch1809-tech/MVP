"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable
} from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { CanonicalBomRow, MaterialPriceComparison } from "@/types/bom";
import { getComparisonObjectLabel, normalizeCostCategory } from "@/lib/bom/cost-comparison";
import { DetailsDialog } from "@/components/DetailsDialog";

type Props = {
  rows: CanonicalBomRow[];
  priceComparisonsByRowId?: Record<string, MaterialPriceComparison>;
  onUpdateRow?: (rowId: string, patch: Partial<CanonicalBomRow>) => void;
  onDeleteRow?: (rowId: string) => void;
};

type RowEditDraft = {
  materialName: string;
  normalizedName: string;
  spec: string;
  category: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  remark: string;
  amountMode: "calculated" | "manual";
};

export function BomTable({ rows, priceComparisonsByRowId = {}, onUpdateRow, onDeleteRow }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<RowEditDraft | null>(null);
  const [editError, setEditError] = useState("");
  const activeRow = rows.find((row) => row.id === activeRowId) ?? null;

  const startEdit = useCallback((row: CanonicalBomRow) => {
    const expectedAmount = row.quantity * row.unitPrice;
    const calculated =
      row.quantity > 0 &&
      row.unitPrice > 0 &&
      Math.abs(expectedAmount - row.amount) <= Math.max(0.01, Math.abs(expectedAmount) * 0.02);
    setActiveRowId(row.id);
    setIsEditing(true);
    setEditError("");
    setEditDraft({
      materialName: row.materialName,
      normalizedName: row.normalizedName,
      spec: row.spec,
      category: row.category,
      unit: row.unit,
      quantity: String(row.quantity),
      unitPrice: String(row.unitPrice),
      amount: String(row.amount),
      remark: row.remark,
      amountMode: calculated || row.isAmountCalculated ? "calculated" : "manual"
    });
  }, []);

  const closeDialog = useCallback(() => {
    setActiveRowId(null);
    setIsEditing(false);
    setEditDraft(null);
    setEditError("");
  }, []);

  const showDetails = useCallback((row: CanonicalBomRow) => {
    setActiveRowId(row.id);
    setIsEditing(false);
    setEditDraft(null);
    setEditError("");
  }, []);

  function updateDraft(key: keyof RowEditDraft, value: string) {
    setEditDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function saveEdit(row: CanonicalBomRow) {
    if (!editDraft || !onUpdateRow) return;
    const quantity = toEditableNumber(editDraft.quantity);
    const unitPrice = toEditableNumber(editDraft.unitPrice);
    const manualAmount = toEditableNumber(editDraft.amount);
    const materialName = editDraft.materialName.trim();
    const normalizedName = editDraft.normalizedName.trim() || materialName;
    if (!materialName) {
      setEditError("请填写物料名称。");
      return;
    }
    if (editDraft.amountMode === "calculated" && (quantity <= 0 || unitPrice <= 0)) {
      setEditError("自动计算金额时，需要填写大于 0 的数量和单价。");
      return;
    }
    const amount =
      editDraft.amountMode === "calculated"
        ? roundEditableMoney(quantity * unitPrice)
        : manualAmount;
    if (amount <= 0) {
      setEditError("请填写大于 0 的成本金额，或切换为“数量 × 单价”。");
      return;
    }

    onUpdateRow(row.id, {
      materialName,
      normalizedName,
      spec: editDraft.spec.trim(),
      category: editDraft.category.trim(),
      unit: editDraft.unit.trim(),
      quantity,
      unitPrice,
      amount,
      totalPrice: amount,
      remark: editDraft.remark.trim(),
      dataIssues: buildEditableDataIssues({ materialName, quantity, unitPrice, amount }),
      isAmountCalculated: editDraft.amountMode === "calculated"
    });
    closeDialog();
  }

  const deleteRow = useCallback((row: CanonicalBomRow) => {
    if (!onDeleteRow) return;
    const confirmed = window.confirm(`确认删除这条 BOM 行吗？\n${row.supplierName} / ${row.materialName}`);
    if (!confirmed) return;
    onDeleteRow(row.id);
    if (activeRowId === row.id) closeDialog();
  }, [activeRowId, closeDialog, onDeleteRow]);

  const columns = useMemo<ColumnDef<CanonicalBomRow>[]>(
    () => [
      {
        id: "actions",
        header: "操作",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {onUpdateRow && (
              <button
                type="button"
                className="motion-lift rounded-[9px] bg-slate-950 px-2.5 py-1.5 text-[11px] font-semibold text-white active:scale-[0.98]"
                onClick={() => startEdit(row.original)}
              >
                编辑
              </button>
            )}
            <button
              type="button"
              className="motion-lift rounded-[9px] border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-500 active:scale-[0.98]"
              onClick={() => showDetails(row.original)}
            >
              详情
            </button>
            {onDeleteRow && (
              <button
                type="button"
                className="motion-lift rounded-[9px] bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-danger active:scale-[0.98]"
                onClick={() => deleteRow(row.original)}
              >
                删除
              </button>
            )}
          </div>
        )
      },
      {
        id: "quote",
        accessorFn: (row) => getComparisonObjectLabel(row),
        header: "报价",
        cell: ({ row }) => <TruncatedText value={getComparisonObjectLabel(row.original)} />
      },
      {
        accessorKey: "materialName",
        header: "物料",
        cell: ({ row }) => <TruncatedText value={row.original.materialName} strong />
      },
      {
        accessorKey: "spec",
        header: "规格",
        cell: ({ row }) => <TruncatedText value={row.original.spec || "—"} />
      },
      {
        id: "standardCategory",
        header: "品类",
        cell: ({ row }) => normalizeCostCategory(row.original.category, row.original.materialName)
      },
      {
        accessorKey: "quantity",
        header: "数量",
        cell: ({ row }) => (
          <span>{formatQuantity(row.original.quantity)} <span className="text-[10px] text-slate-400">{row.original.unit}</span></span>
        )
      },
      {
        accessorKey: "unitPrice",
        header: "单价",
        cell: ({ row }) => row.original.unitPrice > 0 ? formatMoney(row.original.unitPrice) : <span className="text-slate-300">—</span>
      },
      {
        accessorKey: "amount",
        header: "成本",
        cell: ({ row }) => (
          <span className="font-semibold text-slate-900">
            {formatMoney(row.original.amount)}
            {row.original.isAmountCalculated && <span className="ml-1 rounded bg-teal-50 px-1 py-0.5 text-[9px] text-accent">自动</span>}
          </span>
        )
      },
      {
        id: "marketPrice",
        header: "参考价",
        cell: ({ row }) => {
          const comparison = priceComparisonsByRowId[row.original.id];
          if (!comparison?.referenceUnitPrice) return <span className="text-slate-400">未核价</span>;
          return (
            <span title={comparison.rule}>
              {formatMoney(comparison.referenceUnitPrice)}
              {comparison.differenceRate !== undefined && (
                <span className={`ml-1 text-[10px] ${comparison.differenceRate >= 0 ? "text-danger" : "text-accent"}`}>
                  {formatPercent(comparison.differenceRate)}
                </span>
              )}
            </span>
          );
        }
      },
      {
        id: "issues",
        header: "状态",
        cell: ({ row }) => {
          const priceRisk = priceComparisonsByRowId[row.original.id];
          if (row.original.dataIssues.length > 0) {
            return (
              <button
                className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold text-danger ring-1 ring-red-100"
                onClick={() => showDetails(row.original)}
              >
                待检查 {row.original.dataIssues.length}
              </button>
            );
          }
          if (priceRisk) {
            const risk = getMarketRiskMeta(priceRisk);
            return (
              <button
                className={`rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ${risk.className}`}
                onClick={() => showDetails(row.original)}
              >
                {risk.label}
              </button>
            );
          }
          return (
            <button
              className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100"
              onClick={() => showDetails(row.original)}
            >
              正常
            </button>
          );
        }
      }
    ],
    [deleteRow, onDeleteRow, onUpdateRow, priceComparisonsByRowId, showDetails, startEdit]
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  if (rows.length === 0) {
    return (
      <div className="type-body border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
        当前没有可展示的 BOM 明细。请上传 BOM，或调整筛选条件。
      </div>
    );
  }

  return (
    <>
      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-[16px] border border-slate-200/80 bg-white">
        <div className="max-h-[560px] max-w-full overflow-auto">
          <table className="type-table resizable-table min-w-[1040px] table-fixed text-left">
            <thead className="sticky top-0 z-20 bg-slate-50/95 text-slate-600 shadow-sm backdrop-blur">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="whitespace-nowrap border-b border-slate-200 px-2.5 py-2 font-semibold">
                      <button
                        className="w-full truncate rounded-[8px] px-1 py-1 text-left transition hover:bg-slate-100"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className="ml-1">
                          {header.column.getIsSorted() === "asc" ? "↑" : header.column.getIsSorted() === "desc" ? "↓" : ""}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 bg-white transition hover:bg-slate-50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="overflow-hidden whitespace-nowrap px-2.5 py-2 text-slate-700">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DetailsDialog
        open={Boolean(activeRow)}
        title={isEditing ? "修改物料" : "物料详情"}
        eyebrow={activeRow ? `${activeRow.supplierName} · 第 ${activeRow.rowNumber} 行` : "明细"}
        size="wide"
        onClose={closeDialog}
      >
        {activeRow && (
          isEditing && editDraft ? (
            <BomRowEditor
              row={activeRow}
              draft={editDraft}
              error={editError}
              onChange={updateDraft}
              onCancel={closeDialog}
              onSave={() => saveEdit(activeRow)}
            />
          ) : (
            <BomRowDetails
              row={activeRow}
              priceComparison={priceComparisonsByRowId[activeRow.id]}
              canEdit={Boolean(onUpdateRow)}
              onEdit={() => startEdit(activeRow)}
            />
          )
        )}
      </DetailsDialog>
    </>
  );
}

function BomRowEditor({
  row,
  draft,
  error,
  onChange,
  onCancel,
  onSave
}: {
  row: CanonicalBomRow;
  draft: RowEditDraft;
  error: string;
  onChange: (key: keyof RowEditDraft, value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const quantity = toEditableNumber(draft.quantity);
  const unitPrice = toEditableNumber(draft.unitPrice);
  const previewAmount =
    draft.amountMode === "calculated"
      ? roundEditableMoney(quantity * unitPrice)
      : toEditableNumber(draft.amount);

  return (
    <div className="grid gap-4">
      <div className="rounded-[14px] bg-slate-50 px-4 py-3">
        <p className="text-xs text-slate-500">正在修改</p>
        <p className="mt-1 truncate text-sm font-semibold text-slate-900" title={row.materialName}>
          {row.materialName}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <EditField label="物料名称" value={draft.materialName} onChange={(value) => onChange("materialName", value)} />
        <EditField label="规格描述" value={draft.spec} onChange={(value) => onChange("spec", value)} />
        <EditField label="品类" value={draft.category} onChange={(value) => onChange("category", value)} />
        <EditField label="单位" value={draft.unit} onChange={(value) => onChange("unit", value)} />
      </div>

      <section className="rounded-[15px] border border-slate-200 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">成本金额</p>
            <p className="mt-0.5 text-xs text-slate-500">可以自动计算，也可以直接填写供应商给出的成本。</p>
          </div>
          <div className="inline-grid grid-cols-2 rounded-[11px] bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => onChange("amountMode", "calculated")}
              className={`rounded-[8px] px-3 py-1.5 text-[11px] font-semibold ${
                draft.amountMode === "calculated" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
              }`}
            >
              数量 × 单价
            </button>
            <button
              type="button"
              onClick={() => onChange("amountMode", "manual")}
              className={`rounded-[8px] px-3 py-1.5 text-[11px] font-semibold ${
                draft.amountMode === "manual" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
              }`}
            >
              直接填成本
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <EditField label="数量" value={draft.quantity} onChange={(value) => onChange("quantity", value)} inputMode="decimal" />
          <EditField
            label={draft.amountMode === "manual" ? "单价（可不填）" : "单价"}
            value={draft.unitPrice}
            onChange={(value) => onChange("unitPrice", value)}
            inputMode="decimal"
          />
          {draft.amountMode === "calculated" ? (
            <label className="block min-w-0">
              <span className="type-caption font-semibold text-slate-500">计算后成本</span>
              <output className="mt-1 flex h-10 w-full items-center rounded-[12px] bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-100">
                {formatMoney(previewAmount)}
              </output>
            </label>
          ) : (
            <EditField label="成本金额" value={draft.amount} onChange={(value) => onChange("amount", value)} inputMode="decimal" />
          )}
        </div>
      </section>

      <label className="block">
        <span className="type-caption font-semibold text-slate-500">备注</span>
        <input
          value={draft.remark}
          onChange={(event) => onChange("remark", event.target.value)}
          className="field-shell mt-1 h-10 w-full rounded-[12px] px-3 text-sm outline-none"
        />
      </label>

      <details className="rounded-[13px] border border-slate-200 bg-slate-50/70">
        <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-slate-600">
          更多识别信息
        </summary>
        <div className="border-t border-slate-200 px-3 py-3">
          <EditField
            label="用于系统匹配的名称"
            value={draft.normalizedName}
            onChange={(value) => onChange("normalizedName", value)}
          />
        </div>
      </details>

      {error && (
        <div className="rounded-[12px] bg-red-50 px-3 py-2 text-xs font-semibold text-danger ring-1 ring-red-100">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
        <button type="button" className="button-secondary rounded-[11px] px-4 py-2 text-xs font-semibold" onClick={onCancel}>
          取消
        </button>
        <button type="button" className="button-primary rounded-[11px] px-5 py-2 text-xs font-semibold" onClick={onSave}>
          保存修改
        </button>
      </div>
    </div>
  );
}

function BomRowDetails({
  row,
  priceComparison,
  canEdit,
  onEdit
}: {
  row: CanonicalBomRow;
  priceComparison?: MaterialPriceComparison;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <DetailValue label="报价" value={getComparisonObjectLabel(row)} />
        <DetailValue label="物料" value={row.materialName} />
        <DetailValue label="规格" value={row.spec || "未填写"} />
        <DetailValue label="品类" value={normalizeCostCategory(row.category, row.materialName)} />
        <DetailValue label="数量" value={`${formatQuantity(row.quantity)} ${row.unit || ""}`.trim()} />
        <DetailValue label="单价" value={row.unitPrice > 0 ? formatMoney(row.unitPrice) : "未填写"} />
        <DetailValue label="成本" value={formatMoney(row.amount)} strong />
        <DetailValue label="来源" value={`${row.sourceFileName} · 第 ${row.rowNumber} 行`} />
      </div>

      {row.dataIssues.length > 0 ? (
        <section className="rounded-[14px] bg-red-50 p-3 ring-1 ring-red-100">
          <p className="text-xs font-semibold text-danger">需要检查</p>
          <div className="mt-2 grid gap-1.5 text-xs text-red-800">
            {row.dataIssues.map((issue, index) => (
              <p key={`${issue.type}-${index}`}>
                {issue.message}
                {issue.expected !== undefined && issue.actual !== undefined
                  ? ` 建议值 ${issue.expected}，当前值 ${issue.actual}。`
                  : ""}
              </p>
            ))}
          </div>
        </section>
      ) : (
        <div className="rounded-[12px] bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          这条物料目前没有发现明显的数据问题。
        </div>
      )}

      {priceComparison && (
        <section className="rounded-[14px] bg-blue-50 p-3 text-xs text-slate-700 ring-1 ring-blue-100">
          <p className="font-semibold text-slate-900">材料参考价</p>
          <p className="mt-1">{priceComparison.rule}</p>
          <p className="mt-1 text-slate-600">{priceComparison.suggestion}</p>
        </section>
      )}

      <details className="rounded-[14px] border border-slate-200 bg-white">
        <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-slate-600">
          查看供应商原始字段
        </summary>
        <div className="grid border-t border-slate-200 sm:grid-cols-2">
          {Object.entries(row.originalFields).map(([key, value]) => (
            <div key={key} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 border-b border-slate-100 px-3 py-2 text-xs">
              <span className="truncate font-semibold text-slate-500" title={key}>{key}</span>
              <span className="break-words text-slate-700">{formatOriginalValue(value)}</span>
            </div>
          ))}
        </div>
      </details>

      {canEdit && (
        <div className="flex justify-end border-t border-slate-200 pt-3">
          <button type="button" className="button-primary rounded-[11px] px-5 py-2 text-xs font-semibold" onClick={onEdit}>
            修改这条物料
          </button>
        </div>
      )}
    </div>
  );
}

function DetailValue({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0 rounded-[12px] bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-semibold text-slate-400">{label}</p>
      <p className={`mt-1 truncate text-xs ${strong ? "font-bold text-slate-950" : "font-semibold text-slate-700"}`} title={value}>
        {value}
      </p>
    </div>
  );
}

function TruncatedText({ value, strong = false }: { value: string; strong?: boolean }) {
  return (
    <span className={`block truncate ${strong ? "font-semibold text-slate-900" : ""}`} title={value}>
      {value || "—"}
    </span>
  );
}

function formatMoney(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatQuantity(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("zh-CN", { maximumFractionDigits: 4 }) : "0";
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("zh-CN", { style: "percent", maximumFractionDigits: 1 }) : "0%";
}

function EditField({
  label,
  value,
  onChange,
  inputMode = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "text" | "decimal";
}) {
  return (
    <label className="block min-w-0">
      <span className="type-caption font-semibold text-slate-500">{label}</span>
      <input
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        className="field-shell mt-1 h-10 w-full rounded-[12px] px-3 text-sm outline-none"
      />
    </label>
  );
}

function toEditableNumber(value: string): number {
  const parsed = Number(value.replace(/[,，¥￥$]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundEditableMoney(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : 0;
}

function formatOriginalValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function buildEditableDataIssues(input: {
  materialName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}): CanonicalBomRow["dataIssues"] {
  const issues: CanonicalBomRow["dataIssues"] = [];
  if (!input.materialName) issues.push({ type: "missing_required_field", message: "缺少物料名称，无法稳定追溯该行。" });
  if (input.quantity <= 0) issues.push({ type: "missing_required_field", message: "数量为空或小于等于 0。" });
  if (input.amount <= 0) issues.push({ type: "missing_required_field", message: "金额为空或小于等于 0。" });

  if (input.quantity > 0 && input.unitPrice > 0 && input.amount > 0) {
    const expected = Number((input.quantity * input.unitPrice).toFixed(4));
    const actual = Number(input.amount.toFixed(4));
    const tolerance = Math.max(0.01, Math.abs(expected) * 0.02);
    if (Math.abs(expected - actual) > tolerance) {
      issues.push({
        type: "amount_mismatch",
        message: "数量 × 单价 与金额不一致。",
        expected,
        actual
      });
    }
  }

  return issues;
}

function getMarketRiskMeta(comparison: MaterialPriceComparison): { label: string; className: string } {
  if (comparison.status === "not_found") return { label: "无参考", className: "bg-slate-50 text-slate-500 ring-slate-200" };
  if (comparison.status === "unit_mismatch") return { label: "单位不同", className: "bg-amber-50 text-warn ring-amber-100" };
  if (comparison.riskLevel === "high") return { label: "高风险", className: "bg-red-50 text-danger ring-red-100" };
  if (comparison.riskLevel === "medium") return { label: "待确认", className: "bg-amber-50 text-warn ring-amber-100" };
  if (comparison.riskLevel === "low") return { label: "轻微偏离", className: "bg-blue-50 text-brand ring-blue-100" };
  return { label: "接近行情", className: "bg-emerald-50 text-accent ring-emerald-100" };
}
