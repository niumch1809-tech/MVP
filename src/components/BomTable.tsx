"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable
} from "@tanstack/react-table";
import { Fragment, useCallback, useMemo, useState } from "react";
import { CanonicalBomRow, MaterialPriceComparison } from "@/types/bom";
import { normalizeCostCategory } from "@/lib/bom/cost-comparison";

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
};

export function BomTable({ rows, priceComparisonsByRowId = {}, onUpdateRow, onDeleteRow }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<RowEditDraft | null>(null);

  const startEdit = useCallback((row: CanonicalBomRow) => {
    setExpandedRowId(row.id);
    setEditingRowId(row.id);
    setEditDraft({
      materialName: row.materialName,
      normalizedName: row.normalizedName,
      spec: row.spec,
      category: row.category,
      unit: row.unit,
      quantity: String(row.quantity),
      unitPrice: String(row.unitPrice),
      amount: String(row.amount),
      remark: row.remark
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingRowId(null);
    setEditDraft(null);
  }, []);

  function updateDraft(key: keyof RowEditDraft, value: string) {
    setEditDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function saveEdit(row: CanonicalBomRow) {
    if (!editDraft || !onUpdateRow) return;
    const quantity = toEditableNumber(editDraft.quantity);
    const unitPrice = toEditableNumber(editDraft.unitPrice);
    const amount = toEditableNumber(editDraft.amount);
    const materialName = editDraft.materialName.trim();
    const normalizedName = editDraft.normalizedName.trim() || materialName;

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
      isAmountCalculated: false
    });
    cancelEdit();
  }

  const deleteRow = useCallback((row: CanonicalBomRow) => {
    if (!onDeleteRow) return;
    const confirmed = window.confirm(`确认删除这条 BOM 行吗？\n${row.supplierName} / ${row.materialName}`);
    if (!confirmed) return;
    onDeleteRow(row.id);
    if (expandedRowId === row.id) setExpandedRowId(null);
    if (editingRowId === row.id) cancelEdit();
  }, [cancelEdit, editingRowId, expandedRowId, onDeleteRow]);

  const columns = useMemo<ColumnDef<CanonicalBomRow>[]>(
    () => [
      {
        id: "actions",
        header: "操作",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            {onUpdateRow && (
              <button
                type="button"
                className="motion-lift rounded-full bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white active:scale-[0.98]"
                onClick={() => startEdit(row.original)}
              >
                修改
              </button>
            )}
            {onDeleteRow && (
              <button
                type="button"
                className="motion-lift rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-danger ring-1 ring-red-100 active:scale-[0.98]"
                onClick={() => deleteRow(row.original)}
              >
                删除
              </button>
            )}
          </div>
        )
      },
      { accessorKey: "supplierName", header: "供应商" },
      { accessorKey: "productName", header: "产品" },
      { accessorKey: "sourceFileName", header: "文件" },
      { accessorKey: "rowNumber", header: "原行号" },
      { accessorKey: "partNumber", header: "料号" },
      { accessorKey: "materialName", header: "物料名称" },
      { accessorKey: "normalizedName", header: "匹配名" },
      { accessorKey: "spec", header: "规格型号" },
      {
        id: "standardCategory",
        header: "标准品类",
        cell: ({ row }) => normalizeCostCategory(row.original.category, row.original.materialName)
      },
      { accessorKey: "category", header: "原品类" },
      { accessorKey: "unit", header: "单位" },
      { accessorKey: "quantity", header: "数量" },
      {
        accessorKey: "unitPrice",
        header: "单价",
        cell: ({ row }) => formatMoney(row.original.unitPrice)
      },
      {
        accessorKey: "amount",
        header: "金额",
        cell: ({ row }) => (
          <span>
            {formatMoney(row.original.amount)}
            {row.original.isAmountCalculated && <span className="ml-1 bg-teal-50 px-1.5 py-0.5 text-xs text-accent">自动</span>}
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
            <span>
              {formatMoney(comparison.referenceUnitPrice)}
              <span className="ml-1 text-xs text-slate-400">{comparison.currency}</span>
            </span>
          );
        }
      },
      {
        id: "marketGap",
        header: "行情差异",
        cell: ({ row }) => {
          const comparison = priceComparisonsByRowId[row.original.id];
          if (!comparison || comparison.differenceRate === undefined) return <span className="text-slate-400">-</span>;
          return (
            <span className={comparison.differenceRate >= 0 ? "font-semibold text-danger" : "font-semibold text-accent"}>
              {formatPercent(comparison.differenceRate)}
            </span>
          );
        }
      },
      {
        id: "marketRisk",
        header: "行情风险",
        cell: ({ row }) => {
          const comparison = priceComparisonsByRowId[row.original.id];
          if (!comparison) return <span className="rounded-full bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-400 ring-1 ring-slate-100">未刷新</span>;
          const risk = getMarketRiskMeta(comparison);
          return <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${risk.className}`}>{risk.label}</span>;
        }
      },
      { accessorKey: "remark", header: "备注" },
      {
        id: "issues",
        header: "数据状态",
        cell: ({ row }) =>
          row.original.dataIssues.length > 0 ? (
            <button
              className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-danger ring-1 ring-red-100"
              onClick={() => setExpandedRowId(expandedRowId === row.original.id ? null : row.original.id)}
            >
              异常 {row.original.dataIssues.length}
            </button>
          ) : (
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">正常</span>
          )
      },
      {
        id: "raw",
        header: "追溯",
        cell: ({ row }) => (
          <button
            className="motion-lift rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 active:scale-[0.98]"
            onClick={() => setExpandedRowId(expandedRowId === row.original.id ? null : row.original.id)}
          >
            原始字段
          </button>
        )
      }
    ],
    [deleteRow, expandedRowId, onDeleteRow, onUpdateRow, priceComparisonsByRowId, startEdit]
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
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-[22px] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
      <div className="max-h-[560px] max-w-full overflow-auto">
        <table className="type-table resizable-table min-w-[1680px] text-left">
          <thead className="sticky top-0 bg-white/95 text-slate-600 shadow-sm">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="whitespace-nowrap border-b border-slate-200 px-3 py-2 font-semibold">
                    <button
                      className="rounded-full px-2 py-1 text-left transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-slate-100"
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
              <Fragment key={row.id}>
                <tr className="border-b border-slate-100 bg-white transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-slate-50">
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`whitespace-nowrap px-3 py-2 text-slate-700 ${
                        cell.column.id === "materialName" ? "font-semibold text-ink" : ""
                      }`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
                {expandedRowId === row.original.id && (
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <td colSpan={columns.length} className="px-3 py-2">
                      {row.original.dataIssues.length > 0 && (
                        <div className="type-body mb-3 border border-red-200 bg-red-50 p-3 text-danger">
                          {row.original.dataIssues.map((issue, index) => (
                            <p key={`${issue.type}-${index}`}>
                              {issue.message}
                              {issue.expected !== undefined && issue.actual !== undefined
                                ? ` 应为 ${issue.expected}，实际为 ${issue.actual}。`
                                : ""}
                            </p>
                          ))}
                        </div>
                      )}
                      {priceComparisonsByRowId[row.original.id] && (
                        <div className="type-body mb-3 rounded-[16px] bg-blue-50 p-3 text-slate-700 ring-1 ring-blue-100">
                          <p className="font-semibold text-ink">材料行情核验</p>
                          <p className="mt-1">{priceComparisonsByRowId[row.original.id].rule}</p>
                          <p className="mt-1 text-slate-600">{priceComparisonsByRowId[row.original.id].suggestion}</p>
                        </div>
                      )}
                      {editingRowId === row.original.id && editDraft && (
                        <div className="mb-3 rounded-[18px] bg-white p-3 ring-1 ring-slate-200">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-ink">修改异常物料</p>
                              <p className="text-xs text-slate-500">保存后会重新核验数量、单价、金额之间的关系。</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button type="button" className="button-secondary rounded-[12px] px-3 py-2 text-xs font-semibold" onClick={cancelEdit}>
                                取消
                              </button>
                              <button type="button" className="button-primary rounded-[12px] px-3 py-2 text-xs font-semibold" onClick={() => saveEdit(row.original)}>
                                保存
                              </button>
                            </div>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <EditField label="物料名称" value={editDraft.materialName} onChange={(value) => updateDraft("materialName", value)} />
                            <EditField label="匹配名" value={editDraft.normalizedName} onChange={(value) => updateDraft("normalizedName", value)} />
                            <EditField label="规格描述" value={editDraft.spec} onChange={(value) => updateDraft("spec", value)} />
                            <EditField label="品类" value={editDraft.category} onChange={(value) => updateDraft("category", value)} />
                            <EditField label="单位" value={editDraft.unit} onChange={(value) => updateDraft("unit", value)} />
                            <EditField label="数量" value={editDraft.quantity} onChange={(value) => updateDraft("quantity", value)} inputMode="decimal" />
                            <EditField label="单价" value={editDraft.unitPrice} onChange={(value) => updateDraft("unitPrice", value)} inputMode="decimal" />
                            <EditField label="金额" value={editDraft.amount} onChange={(value) => updateDraft("amount", value)} inputMode="decimal" />
                            <label className="block md:col-span-2 xl:col-span-4">
                              <span className="type-caption font-semibold text-slate-500">备注</span>
                              <input
                                value={editDraft.remark}
                                onChange={(event) => updateDraft("remark", event.target.value)}
                                className="field-shell mt-1 h-10 w-full rounded-[12px] px-3 text-sm outline-none"
                              />
                            </label>
                          </div>
                        </div>
                      )}
                      <pre className="max-h-48 overflow-auto bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                        {JSON.stringify(row.original.originalFields, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatMoney(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
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

function buildEditableDataIssues(input: {
  materialName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}): CanonicalBomRow["dataIssues"] {
  const issues: CanonicalBomRow["dataIssues"] = [];
  if (!input.materialName) issues.push({ type: "missing_required_field", message: "缺少物料名称，无法稳定追溯该行。" });
  if (input.quantity <= 0) issues.push({ type: "missing_required_field", message: "数量为空或小于等于 0。" });
  if (input.unitPrice <= 0) issues.push({ type: "missing_required_field", message: "单价为空或小于等于 0。" });
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
  if (comparison.status === "unit_mismatch") return { label: "单位核验", className: "bg-amber-50 text-warn ring-amber-100" };
  if (comparison.riskLevel === "high") return { label: "高风险", className: "bg-red-50 text-danger ring-red-100" };
  if (comparison.riskLevel === "medium") return { label: "需核验", className: "bg-amber-50 text-warn ring-amber-100" };
  if (comparison.riskLevel === "low") return { label: "轻微偏离", className: "bg-blue-50 text-brand ring-blue-100" };
  return { label: "接近行情", className: "bg-emerald-50 text-accent ring-emerald-100" };
}
