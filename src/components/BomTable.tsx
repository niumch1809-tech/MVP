"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable
} from "@tanstack/react-table";
import { Fragment, useMemo, useState } from "react";
import { CanonicalBomRow, MaterialPriceComparison } from "@/types/bom";
import { normalizeCostCategory } from "@/lib/bom/cost-comparison";

type Props = {
  rows: CanonicalBomRow[];
  priceComparisonsByRowId?: Record<string, MaterialPriceComparison>;
};

export function BomTable({ rows, priceComparisonsByRowId = {} }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const columns = useMemo<ColumnDef<CanonicalBomRow>[]>(
    () => [
      { accessorKey: "supplierName", header: "供应商" },
      { accessorKey: "productName", header: "产品" },
      { accessorKey: "sourceFileName", header: "文件" },
      { accessorKey: "rowNumber", header: "原行号" },
      { accessorKey: "partNumber", header: "料号" },
      { accessorKey: "materialName", header: "物料名称" },
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
    [expandedRowId, priceComparisonsByRowId]
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
      <div className="border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
        当前没有可展示的 BOM 明细。请上传 BOM，或调整筛选条件。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
      <div className="max-h-[540px] overflow-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-white/95 text-xs text-slate-600 shadow-sm">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="whitespace-nowrap border-b border-slate-200 px-3 py-3 font-semibold">
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
                      className={`whitespace-nowrap px-3 py-3 text-slate-700 ${
                        cell.column.id === "materialName" ? "font-semibold text-ink" : ""
                      }`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
                {expandedRowId === row.original.id && (
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <td colSpan={columns.length} className="px-3 py-3">
                      {row.original.dataIssues.length > 0 && (
                        <div className="mb-3 border border-red-200 bg-red-50 p-3 text-sm text-danger">
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
                        <div className="mb-3 rounded-[16px] bg-blue-50 p-3 text-sm text-slate-700 ring-1 ring-blue-100">
                          <p className="font-semibold text-ink">材料行情核验</p>
                          <p className="mt-1">{priceComparisonsByRowId[row.original.id].rule}</p>
                          <p className="mt-1 text-slate-600">{priceComparisonsByRowId[row.original.id].suggestion}</p>
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

function getMarketRiskMeta(comparison: MaterialPriceComparison): { label: string; className: string } {
  if (comparison.status === "not_found") return { label: "无参考", className: "bg-slate-50 text-slate-500 ring-slate-200" };
  if (comparison.status === "unit_mismatch") return { label: "单位核验", className: "bg-amber-50 text-warn ring-amber-100" };
  if (comparison.riskLevel === "high") return { label: "高风险", className: "bg-red-50 text-danger ring-red-100" };
  if (comparison.riskLevel === "medium") return { label: "需核验", className: "bg-amber-50 text-warn ring-amber-100" };
  if (comparison.riskLevel === "low") return { label: "轻微偏离", className: "bg-blue-50 text-brand ring-blue-100" };
  return { label: "接近行情", className: "bg-emerald-50 text-accent ring-emerald-100" };
}
