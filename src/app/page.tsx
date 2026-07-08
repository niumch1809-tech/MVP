"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BomTable } from "@/components/BomTable";
import { CostDashboard } from "@/components/CostDashboard";
import { IntegratedCostTable } from "@/components/IntegratedCostTable";
import { MaterialPriceWarningPanel } from "@/components/MaterialPriceWarningPanel";
import { buildCostComparison, CostFilters, STANDARD_CATEGORIES } from "@/lib/bom/cost-comparison";
import { parseMaterialPriceFile } from "@/lib/bom/price-table-client";
import {
  BomFileKind,
  BomFileRecord,
  CanonicalBomRow,
  MaterialMarketPrice,
  MaterialPriceQuoteResponse,
  UploadBomResponse
} from "@/types/bom";

type DetailSelection = {
  title: string;
  rows: CanonicalBomRow[];
};

type WorkspaceView = "upload" | "compare" | "details" | "output";

const NAV_ITEMS: Array<{ id: WorkspaceView; label: string; eyebrow: string }> = [
  { id: "upload", label: "数据上传", eyebrow: "01" },
  { id: "compare", label: "报价对比图", eyebrow: "02" },
  { id: "details", label: "数据表与预警", eyebrow: "03" },
  { id: "output", label: "数据输出", eyebrow: "04" }
];

export default function Home() {
  const [records, setRecords] = useState<BomFileRecord[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [kind, setKind] = useState<BomFileKind>("supplier_quote");
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadErrors, setUploadErrors] = useState<UploadBomResponse["errors"]>([]);
  const [activeView, setActiveView] = useState<WorkspaceView>("upload");
  const [isRefreshingMarketPrices, setIsRefreshingMarketPrices] = useState(false);
  const [marketPriceError, setMarketPriceError] = useState("");
  const [marketPriceResult, setMarketPriceResult] = useState<MaterialPriceQuoteResponse | null>(null);
  const [materialPriceProviderUrl, setMaterialPriceProviderUrl] = useState("");
  const [uploadedMarketPrices, setUploadedMarketPrices] = useState<MaterialMarketPrice[]>([]);
  const [priceFileName, setPriceFileName] = useState("");
  const [priceSourceMessage, setPriceSourceMessage] = useState("");
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
  const visibleRows = detailSelection?.rows ?? comparison.filteredRows;
  const marketPriceByRowId = useMemo(
    () => Object.fromEntries((marketPriceResult?.comparisons ?? []).map((item) => [item.rowId, item])),
    [marketPriceResult]
  );
  const selectedSupplierLabel =
    filters.supplierNames.length === 0 ? "全部供应商" : filters.supplierNames.join(" / ");

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
      if (result.records.length > 0) setActiveView("compare");
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

  function setSupplierChecked(nextSupplierName: string, checked: boolean) {
    setFilters((current) => {
      const base = current.supplierNames.length === 0 ? comparison.suppliers : current.supplierNames;
      const next = checked
        ? Array.from(new Set([...base, nextSupplierName]))
        : base.filter((supplier) => supplier !== nextSupplierName);

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

  async function refreshMarketPrices() {
    setIsRefreshingMarketPrices(true);
    setMarketPriceError("");
    try {
      const response = await fetch("/api/material-prices/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerUrl: materialPriceProviderUrl,
          prices: uploadedMarketPrices,
          rows: comparison.filteredRows.map((row) => ({
            id: row.id,
            materialName: row.materialName,
            normalizedName: row.normalizedName,
            category: row.category,
            spec: row.spec,
            unit: row.unit,
            unitPrice: row.unitPrice,
            supplierName: row.supplierName,
            currency: row.currency
          }))
        })
      });
      const result = (await response.json()) as MaterialPriceQuoteResponse | { message?: string };
      if (!response.ok) {
        setMarketPriceError("message" in result ? result.message ?? "材料价格接口调用失败。" : "材料价格接口调用失败。");
        return;
      }
      setMarketPriceResult(result as MaterialPriceQuoteResponse);
      setPriceSourceMessage("");
    } catch {
      setMarketPriceError("无法连接材料价格接口，请检查本地服务或外部价格源配置。");
    } finally {
      setIsRefreshingMarketPrices(false);
    }
  }

  async function handlePriceFileChange(file: File | null) {
    if (!file) return;
    setMarketPriceError("");
    setPriceSourceMessage("");
    try {
      const prices = await parseMaterialPriceFile(file);
      setUploadedMarketPrices(prices);
      setPriceFileName(file.name);
      setPriceSourceMessage(`已载入 ${file.name}，共 ${prices.length} 条参考价。上传价格表会优先用于核价。`);
    } catch (error) {
      setUploadedMarketPrices([]);
      setPriceFileName("");
      setPriceSourceMessage("");
      setMarketPriceError(error instanceof Error ? error.message : "价格表解析失败，请检查字段。");
    }
  }

  function clearUploadedPrices() {
    setUploadedMarketPrices([]);
    setPriceFileName("");
    setPriceSourceMessage("已清空上传价格表，将使用 URL 接口或内置 mock 价格源。");
  }

  function exportRawCsv() {
    downloadCsv(toRawCsv(comparison.filteredRows, marketPriceByRowId), `bom-source-rows-${today()}.csv`);
  }

  function exportComparisonCsv() {
    downloadCsv(toComparisonCsv(comparison), `bom-integrated-comparison-${today()}.csv`);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-transparent">
      <div className="mx-auto grid w-full max-w-[1560px] gap-5 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="reveal-in lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)]">
          <div className="flex h-full flex-col rounded-[28px] bg-white/86 p-3 shadow-[0_26px_80px_rgba(15,23,42,0.10)] ring-1 ring-white/80">
            <div className="rounded-[22px] bg-slate-950 p-5 text-white">
              <div className="mb-8 inline-flex rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80">
                MVP 半自动
              </div>
              <h1 className="text-2xl font-semibold leading-tight tracking-normal">AI 成本核验平台</h1>
              <p className="mt-3 text-sm leading-6 text-white/62">多供应商 BOM 报价核验工作台</p>
            </div>

            <nav className="mt-3 grid gap-1" aria-label="工作流导航">
              {NAV_ITEMS.map((item) => {
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveView(item.id)}
                    className={`group flex items-center justify-between rounded-[18px] px-4 py-3 text-left transition duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.99] ${
                      active ? "bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.18)]" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className={`text-[11px] font-semibold ${active ? "text-white/50" : "text-slate-400"}`}>{item.eyebrow}</span>
                      <span className="text-sm font-semibold">{item.label}</span>
                    </span>
                    <span className={`h-2 w-2 rounded-full ${active ? "bg-white" : "bg-slate-300 group-hover:bg-slate-500"}`} />
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
              <MiniStat label="供应商" value={comparison.suppliers.length.toString()} />
              <MiniStat label="物料" value={comparison.materialComparisons.length.toString()} />
              <MiniStat label="明细行" value={comparison.filteredRows.length.toString()} />
              <MiniStat label="预警" value={issueCount.toString()} tone={issueCount > 0 ? "danger" : "normal"} />
            </div>
          </div>
        </aside>

        <section className="grid min-w-0 gap-5">
          <header className="reveal-in app-surface overflow-hidden rounded-[28px] p-5">
            <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-accent">
                    <span className="status-pulse mr-2 inline-block h-2 w-2 rounded-full bg-accent text-accent" />
                    本地运行中
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-600">
                    {selectedSupplierLabel}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-600">
                    {filters.category || "全部品类"}
                  </span>
                </div>
                <h2 className="mt-4 text-3xl font-semibold tracking-normal text-ink md:text-4xl">
                  {NAV_ITEMS.find((item) => item.id === activeView)?.label}
                </h2>
              </div>
              <div className="grid grid-cols-3 overflow-hidden rounded-[22px] bg-slate-50 text-center text-xs text-slate-500 ring-1 ring-slate-200">
                <MetricCell label="文件" value={records.length.toString()} />
                <MetricCell label="可比物料" value={comparison.materialComparisons.length.toString()} />
                <MetricCell label="异常" value={issueCount.toString()} tone={issueCount > 0 ? "danger" : "normal"} />
              </div>
            </div>
          </header>

          {activeView === "upload" && (
            <UploadView
              files={files}
              kind={kind}
              message={message}
              supplierName={supplierName}
              uploadErrors={uploadErrors}
              isUploading={isUploading}
              records={records}
              onClear={handleClear}
              onFilesChange={setFiles}
              onKindChange={setKind}
              onSupplierNameChange={setSupplierName}
              onSubmit={handleUpload}
            />
          )}

          {activeView === "compare" && (
            <>
              <FilterPanel
                comparison={comparison}
                filters={filters}
                onReset={resetFilters}
                onSelectAllSuppliers={selectAllSuppliers}
                onSupplierChecked={setSupplierChecked}
                onUpdateFilter={updateFilter}
              />
              <CostDashboard
                comparison={comparison}
                selectedCategory={filters.category}
                onInspectRows={(selectedRows, title) => {
                  setDetailSelection({ rows: selectedRows, title });
                  setActiveView("details");
                }}
              />
            </>
          )}

          {activeView === "details" && (
            <>
              <FilterPanel
                comparison={comparison}
                filters={filters}
                onReset={resetFilters}
                onSelectAllSuppliers={selectAllSuppliers}
                onSupplierChecked={setSupplierChecked}
                onUpdateFilter={updateFilter}
              />
              <MaterialPriceWarningPanel
                result={marketPriceResult}
                isLoading={isRefreshingMarketPrices}
                error={marketPriceError}
                rowCount={comparison.filteredRows.length}
                providerUrl={materialPriceProviderUrl}
                uploadedPriceCount={uploadedMarketPrices.length}
                priceFileName={priceFileName}
                sourceMessage={priceSourceMessage}
                onProviderUrlChange={setMaterialPriceProviderUrl}
                onPriceFileChange={handlePriceFileChange}
                onClearUploadedPrices={clearUploadedPrices}
                onRefresh={refreshMarketPrices}
              />
              <section className="app-surface reveal-in rounded-[28px] p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">{detailSelection?.title ?? "当前对比明细"}</h3>
                    <p className="text-xs text-slate-500">排序、筛选和原始字段追溯保留在同一张表内。</p>
                  </div>
                  {detailSelection && (
                    <button
                      onClick={() => setDetailSelection(null)}
                      className="motion-lift rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 active:scale-[0.98]"
                    >
                      返回筛选明细
                    </button>
                  )}
                </div>
                <BomTable rows={visibleRows} priceComparisonsByRowId={marketPriceByRowId} />
              </section>
            </>
          )}

          {activeView === "output" && (
            <section className="reveal-in grid gap-4">
              <div className="app-surface rounded-[28px] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">输出文件</h3>
                    <p className="text-xs text-slate-500">整合表用于供应商横向核价，明细表用于原始数据追溯。</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={exportComparisonCsv}
                      className="motion-lift rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white active:scale-[0.98]"
                    >
                      导出整合成本表
                    </button>
                    <button
                      type="button"
                      onClick={exportRawCsv}
                      className="motion-lift rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 active:scale-[0.98]"
                    >
                      导出明细数据
                    </button>
                  </div>
                </div>
              </div>
              <FilterPanel
                comparison={comparison}
                filters={filters}
                onReset={resetFilters}
                onSelectAllSuppliers={selectAllSuppliers}
                onSupplierChecked={setSupplierChecked}
                onUpdateFilter={updateFilter}
              />
              <IntegratedCostTable
                comparison={comparison}
                onInspectRows={(selectedRows, title) => {
                  setDetailSelection({ rows: selectedRows, title });
                  setActiveView("details");
                }}
              />
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

function UploadView({
  files,
  kind,
  message,
  supplierName,
  uploadErrors,
  isUploading,
  records,
  onClear,
  onFilesChange,
  onKindChange,
  onSupplierNameChange,
  onSubmit
}: {
  files: File[];
  kind: BomFileKind;
  message: string;
  supplierName: string;
  uploadErrors: UploadBomResponse["errors"];
  isUploading: boolean;
  records: BomFileRecord[];
  onClear: () => void;
  onFilesChange: (files: File[]) => void;
  onKindChange: (kind: BomFileKind) => void;
  onSupplierNameChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="reveal-in grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <form onSubmit={onSubmit} className="app-surface rounded-[28px] p-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">供应商</span>
            <input
              value={supplierName}
              onChange={(event) => onSupplierNameChange(event.target.value)}
              className="mt-2 h-11 w-full rounded-[14px] border border-slate-200 bg-white px-4 text-sm outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
              placeholder="留空从文件名识别"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-500">文件类型</span>
            <select
              value={kind}
              onChange={(event) => onKindChange(event.target.value as BomFileKind)}
              className="mt-2 h-11 w-full rounded-[14px] border border-slate-200 bg-white px-4 text-sm outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              <option value="supplier_quote">供应商报价</option>
              <option value="historical_bom">历史 BOM</option>
            </select>
          </label>
        </div>

        <label className="mt-4 block rounded-[24px] border border-dashed border-slate-300 bg-slate-50/80 p-6 transition duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-slate-500 hover:bg-white">
          <span className="text-sm font-semibold text-ink">Excel / CSV 文件</span>
          <input
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            onChange={(event) => onFilesChange(Array.from(event.target.files ?? []))}
            className="mt-4 w-full rounded-[14px] bg-white px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white"
          />
          <div className="mt-4 min-h-6 text-xs text-slate-500">
            {files.length > 0 ? files.map((file) => <span key={`${file.name}-${file.size}`} className="mr-3">{file.name}</span>) : "支持一次上传多个供应商文件"}
          </div>
        </label>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            disabled={isUploading}
            className="motion-lift rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUploading ? "解析中..." : "上传解析"}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="motion-lift rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 active:scale-[0.98]"
          >
            清空
          </button>
        </div>

        {(message || uploadErrors.length > 0) && (
          <div className="mt-4 grid gap-2 text-xs">
            {message && <div className="rounded-[16px] bg-slate-50 p-3 text-slate-600 ring-1 ring-slate-200">{message}</div>}
            {uploadErrors.length > 0 && (
              <div className="rounded-[16px] bg-red-50 p-3 text-danger ring-1 ring-red-100">
                {uploadErrors.map((error) => (
                  <p key={error.fileName}>{error.fileName}: {error.message}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </form>

      <div className="app-surface rounded-[28px] p-5">
        <h3 className="text-sm font-semibold text-ink">解析记录</h3>
        <div className="mt-4 grid gap-2">
          {records.slice(0, 8).map((record) => (
            <div key={record.id} className="rounded-[18px] bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-semibold text-ink">{record.supplierName}</span>
                <span className="text-xs text-slate-500">{record.rowCount} 行</span>
              </div>
              <p className="mt-1 truncate text-xs text-slate-500">{record.fileName}</p>
            </div>
          ))}
          {records.length === 0 && <div className="rounded-[18px] bg-slate-50 p-8 text-center text-sm text-slate-500">暂无解析记录。</div>}
        </div>
      </div>
    </section>
  );
}

function FilterPanel({
  comparison,
  filters,
  onReset,
  onSelectAllSuppliers,
  onSupplierChecked,
  onUpdateFilter
}: {
  comparison: ReturnType<typeof buildCostComparison>;
  filters: CostFilters;
  onReset: () => void;
  onSelectAllSuppliers: () => void;
  onSupplierChecked: (supplierName: string, checked: boolean) => void;
  onUpdateFilter: (key: "category" | "materialQuery", value: string) => void;
}) {
  return (
    <section className="app-surface reveal-in rounded-[28px] p-4">
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_2fr_auto]">
        <div className="block">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-500">供应商筛选</span>
            <button type="button" onClick={onSelectAllSuppliers} className="text-xs font-semibold text-ink hover:text-slate-500">
              全部
            </button>
          </div>
          <div className="mt-2 flex min-h-11 flex-wrap items-center gap-2 rounded-[16px] bg-slate-50 p-1.5 ring-1 ring-slate-200">
            {comparison.suppliers.map((supplier) => {
              const checked = filters.supplierNames.length === 0 || filters.supplierNames.includes(supplier);
              return (
                <label key={supplier} className="group cursor-pointer text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onSupplierChecked(supplier, event.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="motion-lift inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 font-semibold ring-1 ring-slate-200 peer-checked:bg-slate-950 peer-checked:text-white peer-checked:ring-slate-950">
                    <span className={`h-1.5 w-1.5 rounded-full ${checked ? "bg-white" : "bg-slate-300"}`} />
                    {supplier}
                  </span>
                </label>
              );
            })}
            {comparison.suppliers.length === 0 && <span className="px-2 text-sm text-slate-400">上传 BOM 后可筛选</span>}
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-slate-500">品类</span>
          <select
            value={filters.category}
            onChange={(event) => onUpdateFilter("category", event.target.value)}
            className="mt-2 h-11 w-full rounded-[16px] border border-slate-200 bg-white px-4 text-sm outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
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
          <span className="text-xs font-semibold text-slate-500">搜索物料</span>
          <input
            value={filters.materialQuery}
            onChange={(event) => onUpdateFilter("materialQuery", event.target.value)}
            className="mt-2 h-11 w-full rounded-[16px] border border-slate-200 bg-white px-4 text-sm outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            placeholder="物料名称、标准名或规格"
          />
        </label>

        <button
          type="button"
          onClick={onReset}
          className="motion-lift mt-6 h-11 rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 active:scale-[0.98]"
        >
          重置
        </button>
      </div>
    </section>
  );
}

function MiniStat({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "danger" }) {
  return (
    <div className="rounded-[18px] bg-slate-50 p-3 ring-1 ring-slate-200">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone === "danger" ? "text-danger" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function MetricCell({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "danger" }) {
  return (
    <div className="border-r border-slate-200 p-4 last:border-r-0">
      <p className={`text-xl font-semibold ${tone === "danger" ? "text-danger" : "text-ink"}`}>{value}</p>
      <p>{label}</p>
    </div>
  );
}

function toRawCsv(rows: CanonicalBomRow[], marketPriceByRowId: Record<string, MaterialPriceQuoteResponse["comparisons"][number]>): string {
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
    "材料参考价",
    "行情差异率",
    "行情风险",
    "备注",
    "异常",
    "原始字段"
  ];
  const body = rows.map((row) =>
    {
      const marketPrice = marketPriceByRowId[row.id];
      return [
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
      marketPrice?.referenceUnitPrice ?? "",
      marketPrice?.differenceRate === undefined ? "" : `${(marketPrice.differenceRate * 100).toFixed(1)}%`,
      marketPrice ? getMarketRiskLabel(marketPrice.riskLevel, marketPrice.status) : "",
      row.remark,
      row.dataIssues.map((issue) => issue.message).join("; "),
      JSON.stringify(row.originalFields)
      ].map(escapeCsv);
    }
  );

  return `\uFEFF${[headers.map(escapeCsv), ...body].map((line) => line.join(",")).join("\n")}`;
}

function getMarketRiskLabel(
  riskLevel: MaterialPriceQuoteResponse["comparisons"][number]["riskLevel"],
  status: MaterialPriceQuoteResponse["comparisons"][number]["status"]
): string {
  if (status === "not_found") return "无参考";
  if (status === "unit_mismatch") return "单位核验";
  if (riskLevel === "high") return "高风险";
  if (riskLevel === "medium") return "需核验";
  if (riskLevel === "low") return "轻微偏离";
  return "接近行情";
}

function toComparisonCsv(comparison: ReturnType<typeof buildCostComparison>): string {
  const supplierHeaders = comparison.activeSuppliers.flatMap((supplier) => [`${supplier}单价`, `${supplier}数量`, `${supplier}金额`]);
  const headers = ["物料名称", "标准品类", ...supplierHeaders, "最低单价", "最高单价", "差异金额", "差异度", "覆盖供应商"];
  const body = comparison.materialComparisons.map((item) => {
    const supplierCells = comparison.activeSuppliers.flatMap((supplier) => {
      const point = item.suppliers.find((entry) => entry.supplierName === supplier);
      return [point?.unitPrice ?? "", point?.quantity ?? "", point?.amount ?? ""];
    });
    return [
      item.materialName,
      item.category,
      ...supplierCells,
      item.minPrice,
      item.maxPrice,
      item.diffAmount,
      Number.isFinite(item.diffRate) ? `${(item.diffRate * 100).toFixed(1)}%` : "0%",
      `${item.suppliers.length}/${comparison.activeSuppliers.length}`
    ].map(escapeCsv);
  });

  return `\uFEFF${[headers.map(escapeCsv), ...body].map((line) => line.join(",")).join("\n")}`;
}

function downloadCsv(csv: string, fileName: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function escapeCsv(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
