"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BomTable } from "@/components/BomTable";
import { CostDashboard } from "@/components/CostDashboard";
import { buildCostComparison, CostFilters, STANDARD_CATEGORIES } from "@/lib/bom/cost-comparison";
import { BomFileKind, BomFileRecord, CanonicalBomRow, UploadBomResponse } from "@/types/bom";

type DetailSelection = {
  title: string;
  rows: CanonicalBomRow[];
};

export default function Home() {
  const [records, setRecords] = useState<BomFileRecord[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [kind, setKind] = useState<BomFileKind>("supplier_quote");
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadErrors, setUploadErrors] = useState<UploadBomResponse["errors"]>([]);
  const [filters, setFilters] = useState<CostFilters>({
    supplierNames: [],
    category: "",
    materialQuery: ""
  });
  const [detailSelection, setDetailSelection] = useState<DetailSelection | null>(null);

  const rows = useMemo(() => records.flatMap((record) => record.rows), [records]);
  const comparison = useMemo(() => buildCostComparison(rows, filters), [rows, filters]);
  const issueCount = useMemo(
    () => comparison.filteredRows.reduce((sum, row) => sum + row.dataIssues.length, 0),
    [comparison.filteredRows]
  );
  const materialCount = comparison.materialComparisons.length;
  const activeCategoryLabel = filters.category || "全部品类";
  const visibleRows = detailSelection?.rows ?? comparison.filteredRows;

  const refresh = useCallback(async () => {
    const recordsResponse = await fetch("/api/bom/records");
    setRecords(await recordsResponse.json());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (files.length === 0) {
      setMessage("请选择至少一个 Excel 或 CSV 文件。");
      return;
    }

    setIsUploading(true);
    setMessage("");
    setUploadErrors([]);
    setDetailSelection(null);

    const formData = new FormData();
    formData.set("supplierName", supplierName);
    formData.set("kind", kind);
    files.forEach((file) => formData.append("files", file));

    const response = await fetch("/api/bom/upload", {
      method: "POST",
      body: formData
    });
    const result = (await response.json()) as UploadBomResponse | { message?: string };

    if (!response.ok && "message" in result) {
      setMessage(result.message ?? "上传失败，请检查文件格式。");
      setIsUploading(false);
      return;
    }

    if ("records" in result) {
      setUploadErrors(result.errors);
      setMessage(
        result.records.length > 0
          ? `成功解析 ${result.records.length} 个文件，合计 ${result.records.reduce((sum, record) => sum + record.rowCount, 0)} 行。`
          : "没有文件解析成功，请检查表头和文件格式。"
      );
    }

    setFiles([]);
    await refresh();
    setIsUploading(false);
  }

  async function handleClear() {
    await fetch("/api/bom/records", { method: "DELETE" });
    setMessage("已清空本地解析结果。");
    setUploadErrors([]);
    setDetailSelection(null);
    await refresh();
  }

  function updateFilter(key: "category" | "materialQuery", value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setDetailSelection(null);
  }

  function setSupplierChecked(supplierName: string, checked: boolean) {
    setFilters((current) => {
      const base = current.supplierNames.length === 0 ? comparison.suppliers : current.supplierNames;
      const next = checked
        ? Array.from(new Set([...base, supplierName]))
        : base.filter((supplier) => supplier !== supplierName);

      return {
        ...current,
        supplierNames: next.length === comparison.suppliers.length ? [] : next
      };
    });
    setDetailSelection(null);
  }

  function selectAllSuppliers() {
    setFilters((current) => ({ ...current, supplierNames: [] }));
    setDetailSelection(null);
  }

  function resetFilters() {
    setFilters({ supplierNames: [], category: "", materialQuery: "" });
    setDetailSelection(null);
  }

  function exportCsv() {
    const csv = toCsv(comparison.filteredRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bom-cost-comparison-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-transparent">
      <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-4 px-4 py-4">
        <header className="app-surface reveal-in overflow-hidden p-4">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="border border-blue-200 bg-blue-50 px-2 py-1 font-semibold text-brand">MVP 半自动</span>
                <span className="border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-accent">
                  <span className="status-pulse mr-2 inline-block h-2 w-2 bg-accent text-accent" />
                  本地运行中
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-normal text-ink">AI 成本核验平台</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                面向多供应商 BOM 的成本对比工作台：上传、筛选、品类可视化、物料级对比和来源明细集中在同一页面。
              </p>
            </div>
            <div className="grid grid-cols-3 border border-slate-200 bg-slate-50 text-center text-xs text-slate-500">
              <div className="border-r border-slate-200 p-3">
                <p className="text-lg font-bold text-ink">{comparison.suppliers.length}</p>
                <p>供应商库</p>
              </div>
              <div className="border-r border-slate-200 p-3">
                <p className="text-lg font-bold text-ink">{activeCategoryLabel}</p>
                <p>当前品类</p>
              </div>
              <div className="p-3">
                <p className="text-lg font-bold text-ink">{materialCount}</p>
                <p>可比物料</p>
              </div>
            </div>
          </div>
        </header>

        <form onSubmit={handleUpload} className="app-surface reveal-in stagger-1 p-4">
          <div className="grid gap-3 xl:grid-cols-[180px_170px_1.5fr_auto_auto_auto]">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">供应商</span>
              <input
                value={supplierName}
                onChange={(event) => setSupplierName(event.target.value)}
                className="mt-1 h-9 w-full border border-slate-300 bg-white px-3 text-sm outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-brand focus:ring-2 focus:ring-blue-100"
                placeholder="留空从文件名识别"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-600">文件类型</span>
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as BomFileKind)}
                className="mt-1 h-9 w-full border border-slate-300 bg-white px-3 text-sm outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-brand focus:ring-2 focus:ring-blue-100"
              >
                <option value="supplier_quote">供应商报价</option>
                <option value="historical_bom">历史 BOM</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Excel / CSV 文件</span>
              <input
                type="file"
                multiple
                accept=".xlsx,.xls,.csv"
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                className="mt-1 h-9 w-full border border-dashed border-slate-300 bg-slate-50 px-3 py-1 text-sm transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-brand file:mr-3 file:border-0 file:bg-slate-200 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-slate-700"
              />
            </label>

            <button
              disabled={isUploading}
              className="motion-lift mt-5 h-9 bg-brand px-4 text-sm font-semibold text-white shadow-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? "解析中..." : "上传解析"}
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="motion-lift mt-5 h-9 bg-accent px-4 text-sm font-semibold text-white shadow-sm active:scale-[0.98]"
            >
              导出 CSV
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="motion-lift mt-5 h-9 border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 active:scale-[0.98]"
            >
              清空
            </button>
          </div>

          {(files.length > 0 || message || uploadErrors.length > 0) && (
            <div className="mt-3 grid gap-2 text-xs text-slate-600 lg:grid-cols-[1fr_1fr]">
              <div className="min-h-8 border border-slate-200 bg-slate-50 p-2">
                {files.length > 0 ? files.map((file) => <span key={`${file.name}-${file.size}`} className="mr-3">{file.name}</span>) : message}
              </div>
              {uploadErrors.length > 0 && (
                <div className="border border-red-100 bg-red-50 p-2 text-danger">
                  {uploadErrors.map((error) => (
                    <span key={error.fileName} className="mr-3">
                      {error.fileName}: {error.message}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>

        <section className="reveal-in stagger-2 grid gap-3 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
          <Metric label="参与供应商" value={comparison.activeSuppliers.length.toString()} />
          <Metric label="当前明细行" value={comparison.filteredRows.length.toString()} />
          <Metric label="数据异常" value={issueCount.toString()} tone={issueCount > 0 ? "danger" : "normal"} />
        </section>

        <section className="app-surface reveal-in stagger-3 p-4">
          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_2fr_auto]">
            <div className="block">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-600">供应商筛选</span>
                <button
                  type="button"
                  onClick={selectAllSuppliers}
                  className="text-xs font-semibold text-brand hover:text-blue-700"
                >
                  全部
                </button>
              </div>
              <div className="mt-1 flex min-h-10 flex-wrap items-center gap-2 border border-slate-300 bg-slate-50 p-1.5">
                {comparison.suppliers.map((supplier) => {
                  const checked = filters.supplierNames.length === 0 || filters.supplierNames.includes(supplier);
                  return (
                    <label key={supplier} className="group cursor-pointer text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => setSupplierChecked(supplier, event.target.checked)}
                        className="peer sr-only"
                      />
                      <span className="motion-lift inline-flex items-center gap-2 border border-slate-200 bg-white px-3 py-1.5 font-semibold peer-checked:border-blue-200 peer-checked:bg-blue-50 peer-checked:text-brand">
                        <span className={`h-1.5 w-1.5 ${checked ? "bg-brand" : "bg-slate-300"}`} />
                        {supplier}
                      </span>
                    </label>
                  );
                })}
                {comparison.suppliers.length === 0 && (
                  <span className="text-sm text-slate-400">上传供应商 BOM 后可筛选</span>
                )}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-semibold text-slate-600">品类筛选</span>
              <select
                value={filters.category}
                onChange={(event) => updateFilter("category", event.target.value)}
                className="mt-1 h-9 w-full border border-slate-300 bg-white px-3 text-sm outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-brand focus:ring-2 focus:ring-blue-100"
              >
                <option value="">全部品类</option>
                {STANDARD_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-600">搜索物料</span>
              <input
                value={filters.materialQuery}
                onChange={(event) => updateFilter("materialQuery", event.target.value)}
                className="mt-1 h-9 w-full border border-slate-300 bg-white px-3 text-sm outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-brand focus:ring-2 focus:ring-blue-100"
                placeholder="物料名称、标准名或规格"
              />
            </label>

            <button
              type="button"
              onClick={resetFilters}
              className="motion-lift mt-5 h-9 border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 active:scale-[0.98]"
            >
              重置筛选
            </button>
          </div>
        </section>

        <CostDashboard
          comparison={comparison}
          selectedCategory={filters.category}
          onInspectRows={(selectedRows, title) => setDetailSelection({ rows: selectedRows, title })}
        />

        <section className="app-surface p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-ink">{detailSelection?.title ?? "当前对比明细"}</h2>
              <p className="text-xs text-slate-500">
                {detailSelection ? "来自上方图表或物料对比表的来源行。" : "明细表受当前筛选影响，导出 CSV 使用同一批数据。"}
              </p>
            </div>
            {detailSelection && (
              <button
                onClick={() => setDetailSelection(null)}
                className="motion-lift h-8 border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 active:scale-[0.98]"
              >
                返回筛选明细
              </button>
            )}
          </div>
          <BomTable rows={visibleRows} />
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "danger" }) {
  return (
    <div className={`quiet-surface motion-lift p-4 ${tone === "danger" ? "border-red-200 bg-red-50/50" : ""}`}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className={`text-3xl font-bold leading-none ${tone === "danger" ? "text-danger" : "text-ink"}`}>{value}</p>
        <span className={`h-8 w-1.5 ${tone === "danger" ? "bg-danger" : "bg-brand"}`} />
      </div>
    </div>
  );
}

function toCsv(rows: CanonicalBomRow[]): string {
  const headers = [
    "供应商",
    "文件",
    "原行号",
    "物料名称",
    "规格型号",
    "原品类",
    "单位",
    "数量",
    "单价",
    "金额",
    "备注",
    "异常",
    "原始字段"
  ];
  const body = rows.map((row) =>
    [
      row.supplierName,
      row.sourceFileName,
      row.rowNumber,
      row.materialName,
      row.spec,
      row.category,
      row.unit,
      row.quantity,
      row.unitPrice,
      row.amount,
      row.remark,
      row.dataIssues.map((issue) => issue.message).join("; "),
      JSON.stringify(row.originalFields)
    ].map(escapeCsv)
  );

  return `\uFEFF${[headers.map(escapeCsv), ...body].map((line) => line.join(",")).join("\n")}`;
}

function escapeCsv(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
