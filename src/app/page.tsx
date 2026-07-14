"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BomTable } from "@/components/BomTable";
import { CostDashboard } from "@/components/CostDashboard";
import { IntegratedCostTable } from "@/components/IntegratedCostTable";
import { ManualAdjustmentBoard } from "@/components/ManualAdjustmentBoard";
import type { ManualGroup } from "@/components/ManualAdjustmentBoard";
import { MaterialPriceWarningPanel } from "@/components/MaterialPriceWarningPanel";
import { parseBomFileInBrowser } from "@/lib/bom/browser-parser";
import { buildCostComparison, CostFilters } from "@/lib/bom/cost-comparison";
import { getMaterialPriceComparisons } from "@/lib/bom/material-price";
import { parseMaterialPriceFile } from "@/lib/bom/price-table-client";
import { buildTemplateOutputArray } from "@/lib/bom/template-export";
import {
  BomFileKind,
  BomFileRecord,
  CanonicalBomRow,
  MaterialMarketPrice,
  MaterialPriceQuoteResponse,
  UploadBomResponse
} from "@/types/bom";

const LOCAL_RECORDS_KEY = "ai-cost-audit:bom-records";
const LOCAL_MANUAL_CATEGORIES_KEY = "ai-cost-audit:manual-categories";
const LOCAL_MANUAL_GROUPS_KEY = "ai-cost-audit:manual-groups";

type DetailSelection = {
  title: string;
  rows: CanonicalBomRow[];
};

type WorkspaceView = "upload" | "adjust" | "compare" | "details" | "output";

const NAV_ITEMS: Array<{ id: WorkspaceView; label: string; eyebrow: string }> = [
  { id: "upload", label: "数据上传", eyebrow: "01" },
  { id: "adjust", label: "手工校准", eyebrow: "02" },
  { id: "compare", label: "报价对比图", eyebrow: "03" },
  { id: "details", label: "数据表与预警", eyebrow: "04" },
  { id: "output", label: "数据输出", eyebrow: "05" }
];

export default function Home() {
  const [records, setRecords] = useState<BomFileRecord[]>([]);
  const [manualCategories, setManualCategories] = useState<string[]>([]);
  const [manualGroups, setManualGroups] = useState<ManualGroup[]>([]);
  const [productName, setProductName] = useState("");
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
    productName: "",
    category: "",
    materialQuery: ""
  });
  const [outputNameSupplier, setOutputNameSupplier] = useState("");
  const [detailSelection, setDetailSelection] = useState<DetailSelection | null>(null);

  const rows = useMemo(() => records.flatMap((record) => record.rows), [records]);
  const quoteRows = useMemo(() => rows.filter((row) => row.kind === "supplier_quote"), [rows]);
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

  const refresh = useCallback(() => {
    setRecords(loadLocalRecords());
    setManualCategories(loadLocalArray<string>(LOCAL_MANUAL_CATEGORIES_KEY));
    setManualGroups(loadLocalArray<ManualGroup>(LOCAL_MANUAL_GROUPS_KEY));
  }, []);

  useEffect(() => {
    refresh();
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

    const result = await parseSelectedFiles(files, { productName, supplierName, kind });
    const quoteObjectCount = new Set(result.records.flatMap((record) => record.rows.map((row) => row.supplierName))).size;
    setUploadErrors(result.errors);
    setMessage(
      result.records.length > 0
        ? `成功解析 ${result.records.length} 个文件 / ${quoteObjectCount} 个报价对象，合计 ${result.records.reduce((sum, record) => sum + record.rowCount, 0)} 行。`
        : "没有文件解析成功，请检查表头和文件格式。"
    );
    if (result.records.length > 0) {
      const existingRecords = loadLocalRecords();
      const incomingSources = new Set(result.records.map((record) => getRecordSourceKey(record)));
      const incomingFileNames = new Set(result.records.map((record) => record.fileName));
      const nextRecords = [
        ...result.records,
        ...existingRecords.filter((record) => !incomingSources.has(getRecordSourceKey(record)) && !incomingFileNames.has(record.fileName))
      ];
      saveLocalRecords(nextRecords);
      setRecords(nextRecords);
      setProductName("");
      setSupplierName("");
      setFilters(reconcileFilters(filters, nextRecords));
      setActiveView(kind === "supplier_quote" ? "adjust" : "upload");
    }

    setFiles([]);
    setIsUploading(false);
  }

  function handleClear() {
    saveLocalRecords([]);
    setRecords([]);
    setMessage("已清空本地解析结果。");
    setUploadErrors([]);
    setDetailSelection(null);
    resetFilters();
  }

  function handleDeleteRecord(recordId: string) {
    const nextRecords = records.filter((record) => record.id !== recordId);
    saveLocalRecords(nextRecords);
    setRecords(nextRecords);
    setFilters((current) => reconcileFilters(current, nextRecords));
    setMessage("已删除该文件的解析记录。");
    setUploadErrors([]);
    setDetailSelection(null);
  }

  function updateRows(rowIds: string[], patch: Partial<CanonicalBomRow>) {
    if (rowIds.length === 0) return;
    const idSet = new Set(rowIds);
    const nextRecords = records.map((record) => ({
      ...record,
      rows: record.rows.map((row) => (idSet.has(row.id) ? { ...row, ...patch } : row))
    }));
    saveLocalRecords(nextRecords);
    setRecords(nextRecords);
    setDetailSelection(null);
  }

  function createManualCategory(category: string) {
    const next = Array.from(new Set([...manualCategories, category.trim()].filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"));
    saveLocalArray(LOCAL_MANUAL_CATEGORIES_KEY, next);
    setManualCategories(next);
  }

  function deleteManualCategory(category: string) {
    const nextCategories = manualCategories.filter((item) => item !== category);
    const removedGroupIds = new Set(manualGroups.filter((group) => group.category === category).map((group) => group.id));
    const nextGroups = manualGroups.filter((group) => group.category !== category);
    const nextRecords = records.map((record) => ({
      ...record,
      rows: record.rows.map((row) => {
        const shouldClearCategory = row.manualCategory === category;
        const shouldClearGroup = row.manualMatchKey ? removedGroupIds.has(row.manualMatchKey) : false;
        if (!shouldClearCategory && !shouldClearGroup) return row;
        return {
          ...row,
          manualCategory: shouldClearCategory ? "" : row.manualCategory,
          manualMatchKey: shouldClearGroup ? "" : row.manualMatchKey,
          manualName: shouldClearGroup ? "" : row.manualName
        };
      })
    }));
    saveLocalArray(LOCAL_MANUAL_CATEGORIES_KEY, nextCategories);
    saveLocalArray(LOCAL_MANUAL_GROUPS_KEY, nextGroups);
    saveLocalRecords(nextRecords);
    setManualCategories(nextCategories);
    setManualGroups(nextGroups);
    setRecords(nextRecords);
    setDetailSelection(null);
  }

  function updateFilter(key: "productName" | "category" | "materialQuery", value: string) {
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
    setFilters({ supplierNames: [], productName: "", category: "", materialQuery: "" });
    setDetailSelection(null);
  }

  async function refreshMarketPrices() {
    setIsRefreshingMarketPrices(true);
    setMarketPriceError("");
    try {
      const result = await getMaterialPriceComparisons(
        comparison.filteredRows.map((row) => ({
          id: row.id,
          materialName: row.materialName,
          normalizedName: row.normalizedName,
          category: row.category,
          spec: row.spec,
          unit: row.unit,
          unitPrice: row.unitPrice,
          supplierName: row.supplierName,
          currency: row.currency
        })),
        { providerUrl: materialPriceProviderUrl, prices: uploadedMarketPrices }
      );
      setMarketPriceResult(result);
      setPriceSourceMessage("");
    } catch {
      setMarketPriceError("无法连接材料价格接口，请检查外部价格源配置或改用上传价格表。");
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
    downloadCsv(toComparisonCsv(comparison, outputNameSupplier), `bom-integrated-comparison-${today()}.csv`);
  }

  function exportTemplateExcel() {
    const data = buildTemplateOutputArray(comparison, outputNameSupplier);
    downloadBinary(
      data,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      `bom-template-output-${today()}.xlsx`
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-transparent">
      <div className="mx-auto grid w-full max-w-[1560px] gap-5 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="reveal-in lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)]">
          <div className="flex h-full flex-col rounded-[22px] bg-white/86 p-3 shadow-[0_26px_80px_rgba(15,23,42,0.10)] ring-1 ring-white/80">
            <div className="rounded-[22px] bg-slate-950 p-5 text-white">
              <div className="mb-8 inline-flex rounded-[22px] bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80">
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
                    className={`group flex items-center justify-between rounded-[22px] px-4 py-3 text-left transition duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.99] ${
                      active ? "bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.18)]" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className={`text-[11px] font-semibold ${active ? "text-white/50" : "text-slate-400"}`}>{item.eyebrow}</span>
                      <span className="text-sm font-semibold">{item.label}</span>
                    </span>
                    <span className={`h-2 w-2 rounded-[22px] ${active ? "bg-white" : "bg-slate-300 group-hover:bg-slate-500"}`} />
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
          <header className="reveal-in app-surface overflow-hidden rounded-[22px] p-5">
            <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
              <div>
                {activeView !== "upload" && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-accent">
                      <span className="status-pulse mr-2 inline-block h-2 w-2 rounded-[22px] bg-accent text-accent" />
                      本地运行中
                    </span>
                    <span className="rounded-[22px] border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-600">
                      {selectedSupplierLabel}
                    </span>
                    <span className="rounded-[22px] border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-600">
                      {filters.productName || "全部产品"}
                    </span>
                    <span className="rounded-[22px] border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-600">
                      {filters.category || "全部品类"}
                    </span>
                  </div>
                )}
                <h2 className={`${activeView === "upload" ? "" : "mt-4"} text-3xl font-semibold tracking-normal text-ink md:text-4xl`}>
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
              productName={productName}
              supplierName={supplierName}
              uploadErrors={uploadErrors}
              isUploading={isUploading}
              records={records}
              onClear={handleClear}
              onDeleteRecord={handleDeleteRecord}
              onFilesChange={setFiles}
              onKindChange={setKind}
              onProductNameChange={setProductName}
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

          {activeView === "adjust" && (
            <ManualAdjustmentBoard
              rows={quoteRows}
              categories={[...comparison.categories, ...manualCategories]}
              onCreateCategory={createManualCategory}
              onDeleteCategory={deleteManualCategory}
              onUpdateRows={updateRows}
            />
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
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                      输出命名
                      <select
                        value={outputNameSupplier}
                        onChange={(event) => setOutputNameSupplier(event.target.value)}
                        className="bg-transparent text-sm font-semibold text-ink outline-none"
                      >
                        <option value="">自动</option>
                        {comparison.activeSuppliers.map((supplier) => (
                          <option key={supplier} value={supplier}>
                            {supplier}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={exportTemplateExcel}
                      className="motion-lift rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white active:scale-[0.98]"
                    >
                      按模板导出 Excel
                    </button>
                    <button
                      type="button"
                      onClick={exportComparisonCsv}
                      className="motion-lift rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 active:scale-[0.98]"
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
                outputNameSupplier={outputNameSupplier}
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

async function parseSelectedFiles(
  files: File[],
  meta: { productName: string; supplierName: string; kind: BomFileKind }
): Promise<UploadBomResponse> {
  const response: UploadBomResponse = { records: [], errors: [] };
  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["xlsx", "xls", "csv"].includes(extension)) {
      response.errors.push({ fileName: file.name, message: "仅支持 .xlsx、.xls、.csv 文件。" });
      continue;
    }

    try {
      const sourceSignature = getFileSourceSignature(file);
      const fileId = sourceSignature || crypto.randomUUID();
      const record = await parseBomFileInBrowser({
        fileId,
        fileName: file.name,
        productName: meta.productName.trim(),
        supplierName: meta.supplierName || inferNameFromFile(file.name) || "未命名供应商",
        kind: meta.kind,
        data: await file.arrayBuffer(),
        extension
      });
      response.records.push({ ...record, sourceSignature });
    } catch (error) {
      response.errors.push({
        fileName: file.name,
        message: error instanceof Error ? error.message : "文件解析失败。"
      });
    }
  }
  return response;
}

function loadLocalRecords(): BomFileRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_RECORDS_KEY);
    return raw ? (JSON.parse(raw) as BomFileRecord[]) : [];
  } catch {
    return [];
  }
}

function saveLocalRecords(records: BomFileRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));
}

function loadLocalArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function saveLocalArray<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getFileSourceSignature(file: File): string {
  return [file.name, file.size, file.lastModified].join("::");
}

function getRecordSourceKey(record: BomFileRecord): string {
  return record.sourceSignature || [record.kind, record.fileName, record.productName, record.supplierName].join("::");
}

function reconcileFilters(filters: CostFilters, records: BomFileRecord[]): CostFilters {
  const products = new Set(records.flatMap((record) => record.rows.map((row) => row.productName).filter(Boolean)));
  const suppliers = new Set(records.flatMap((record) => record.rows.map((row) => row.supplierName).filter(Boolean)));
  return {
    ...filters,
    productName: !filters.productName || products.has(filters.productName) ? filters.productName : "",
    supplierNames: filters.supplierNames.filter((supplier) => suppliers.has(supplier))
  };
}

function mergePendingFiles(current: File[], incoming: File[]): File[] {
  const bySignature = new Map(current.map((file) => [getFileSourceSignature(file), file]));
  incoming.forEach((file) => bySignature.set(getFileSourceSignature(file), file));
  return Array.from(bySignature.values());
}

function inferNameFromFile(fileName: string): string {
  return fileName
    .replace(/\.(xlsx|xls|csv)$/i, "")
    .replace(/bom|报价|报价格|清单|物料清单/gi, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function UploadView({
  files,
  kind,
  message,
  productName,
  supplierName,
  uploadErrors,
  isUploading,
  records,
  onClear,
  onDeleteRecord,
  onFilesChange,
  onKindChange,
  onProductNameChange,
  onSupplierNameChange,
  onSubmit
}: {
  files: File[];
  kind: BomFileKind;
  message: string;
  productName: string;
  supplierName: string;
  uploadErrors: UploadBomResponse["errors"];
  isUploading: boolean;
  records: BomFileRecord[];
  onClear: () => void;
  onDeleteRecord: (recordId: string) => void;
  onFilesChange: (files: File[]) => void;
  onKindChange: (kind: BomFileKind) => void;
  onProductNameChange: (value: string) => void;
  onSupplierNameChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const kindHelp =
    kind === "supplier_quote"
      ? "供应商报价会进入报价对比、差异分析和输出表。"
      : "历史 BOM 会作为后续价格参考库来源，暂不参与当前供应商报价排名。";

  return (
    <section className="reveal-in grid w-full gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="app-surface rounded-[22px] p-4 2xl:col-span-2">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex rounded-[12px] bg-slate-950 px-3 py-1 text-[11px] font-semibold text-white">
              开始前
            </div>
            <h3 className="mt-2 text-lg font-semibold text-ink">先下载标准模板，或查看 BOM 核验流程</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              模板文件会原样下载，保留输入表和输出表的格式、合并单元格和颜色样式。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsGuideOpen(true)}
              className="motion-lift rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white active:scale-[0.98]"
            >
              查看使用手册
            </button>
            <a
              href="/templates/bom-input-output-template.xlsx"
              download="BOM输入输出模板.xlsx"
              className="motion-lift rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 active:scale-[0.98]"
            >
              获取 BOM 表输入模板
            </a>
          </div>
        </div>
        {isGuideOpen && <UserGuideModal onClose={() => setIsGuideOpen(false)} />}
      </section>
      <form onSubmit={onSubmit} className="app-surface rounded-[22px] p-5">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">上传批次 / 归档名（可选）</span>
            <input
              value={productName}
              onChange={(event) => onProductNameChange(event.target.value)}
              className="mt-2 h-11 w-full rounded-[14px] border border-slate-200 bg-white px-4 text-sm outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
              placeholder="例如：7月供应商报价汇总；可留空"
            />
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              只用于归档本次上传，不作为物料匹配的硬条件；真实供应商、产品、型号、颜色会优先从模板标题识别。
            </p>
          </label>

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
            <p className="mt-2 text-[11px] leading-5 text-slate-500">{kindHelp}</p>
          </label>
        </div>

        <label className="mt-4 block rounded-[22px] border border-dashed border-slate-300 bg-slate-50/80 p-6 transition duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-slate-500 hover:bg-white">
          <span className="text-sm font-semibold text-ink">Excel / CSV 文件</span>
          <span className="ml-2 text-xs text-slate-500">可一次选择多个供应商文件</span>
          <input
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            onChange={(event) => {
              onFilesChange(mergePendingFiles(files, Array.from(event.target.files ?? [])));
              event.currentTarget.value = "";
            }}
            className="mt-4 w-full rounded-[14px] bg-white px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white"
          />
          <div className="mt-4 grid min-h-6 gap-2 text-xs text-slate-500 sm:grid-cols-2 xl:grid-cols-3">
            {files.length > 0 ? (
              files.map((file) => (
                <span
                  key={getFileSourceSignature(file)}
                  className="inline-flex min-w-0 items-center justify-between gap-2 rounded-[16px] bg-white px-3 py-2 ring-1 ring-slate-200"
                >
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label={`删除 ${file.name}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onFilesChange(files.filter((item) => getFileSourceSignature(item) !== getFileSourceSignature(file)));
                    }}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-[12px] text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    ×
                  </button>
                </span>
              ))
            ) : (
              <span>支持一次上传多个供应商文件；重复选择同一文件不会叠加。</span>
            )}
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

      <div className="app-surface rounded-[22px] p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">解析记录</h3>
          <span className="text-xs text-slate-500">{records.length} 个文件</span>
        </div>
        <div className="mt-4 grid max-h-[520px] gap-2 overflow-y-auto pr-1">
          {records.map((record) => (
            <div key={record.id} className="relative rounded-[18px] bg-slate-50 p-3 pr-10 ring-1 ring-slate-200">
              <button
                type="button"
                aria-label={`删除 ${record.fileName}`}
                onClick={() => onDeleteRecord(record.id)}
                className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-[14px] text-slate-400 transition hover:bg-white hover:text-slate-800 hover:ring-1 hover:ring-slate-200"
              >
                ×
              </button>
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-semibold text-ink">{record.productName || "未命名产品"}</span>
                <span className="text-xs text-slate-500">{record.rowCount} 行</span>
              </div>
              <p className="mt-1 truncate text-xs text-slate-500">
                {record.supplierName} · {record.fileName}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                {new Date(record.uploadedAt).toLocaleString("zh-CN", { hour12: false })}
              </p>
            </div>
          ))}
          {records.length === 0 && <div className="rounded-[18px] bg-slate-50 p-8 text-center text-sm text-slate-500">暂无解析记录。</div>}
        </div>
      </div>
    </section>
  );
}

function UserGuideModal({ onClose }: { onClose: () => void }) {
  const steps = [
    {
      title: "1. 上传 BOM",
      body: "上传供应商报价或历史 BOM。上传批次名可以留空；如果模板标题包含“供应商-产品名-型号-颜色”，系统会优先识别这些真实维度。"
    },
    {
      title: "2. 手工校准",
      body: "逐个供应商检查物料，把不同命名但实际相同的物料归到同一品类或手工匹配关系里。"
    },
    {
      title: "3. 报价对比",
      body: "查看供应商总成本、品类成本、成本结构占比和物料级差异。"
    },
    {
      title: "4. 数据表与预警",
      body: "追溯异常价格、缺项、参考价偏离和原始 BOM 行。"
    },
    {
      title: "5. 数据输出",
      body: "按整合后的成本对比表或模板格式导出 Excel，用于内部评审和供应商沟通。"
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <button type="button" aria-hidden="true" tabIndex={-1} className="absolute inset-0 cursor-default" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="使用手册"
        className="app-surface relative max-h-[86vh] w-full max-w-5xl overflow-y-auto rounded-[24px] p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-[12px] bg-slate-950 px-3 py-1 text-[11px] font-semibold text-white">
              使用手册
            </div>
            <h3 className="mt-2 text-xl font-semibold text-ink">BOM 成本核验操作流程</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-lg font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
            aria-label="关闭使用手册"
          >
            ×
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          {steps.map((step) => (
            <div key={step.title} className="rounded-[18px] bg-slate-50 p-3 ring-1 ring-slate-200">
              <h4 className="text-xs font-semibold text-ink">{step.title}</h4>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-[18px] bg-white p-4 text-xs leading-5 text-slate-500 ring-1 ring-slate-200">
          <p>
            物料匹配默认以标准化物料名和手工匹配键为主，不再把上传批次名作为硬条件。需要比较同产品、同型号或不同代产品时，优先通过模板标题和页面筛选来限定范围。
          </p>
        </div>
      </section>
    </div>
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
  onUpdateFilter: (key: "productName" | "category" | "materialQuery", value: string) => void;
}) {
  return (
    <section className="app-surface reveal-in rounded-[22px] p-4">
      <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_2fr_auto]">
        <div className="block">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-500">供应商筛选</span>
            <button type="button" onClick={onSelectAllSuppliers} className="text-xs font-semibold text-ink hover:text-slate-500">
              全部
            </button>
          </div>
          <div className="mt-2 flex min-h-11 flex-wrap items-center gap-2 rounded-[22px] bg-slate-50 p-1.5 ring-1 ring-slate-200">
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
                  <span className="motion-lift inline-flex items-center gap-2 rounded-[22px] bg-white px-3 py-2 font-semibold ring-1 ring-slate-200 peer-checked:bg-slate-950 peer-checked:text-white peer-checked:ring-slate-950">
                    <span className={`h-1.5 w-1.5 rounded-[22px] ${checked ? "bg-white" : "bg-slate-300"}`} />
                    {supplier}
                  </span>
                </label>
              );
            })}
            {comparison.suppliers.length === 0 && <span className="px-2 text-sm text-slate-400">上传 BOM 后可筛选</span>}
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-slate-500">产品</span>
          <select
            value={filters.productName}
            onChange={(event) => onUpdateFilter("productName", event.target.value)}
            className="mt-2 h-11 w-full rounded-[22px] border border-slate-200 bg-white px-4 text-sm outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          >
            <option value="">全部产品</option>
            {comparison.products.map((product) => (
              <option key={product} value={product}>
                {product}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-slate-500">品类</span>
          <select
            value={filters.category}
            onChange={(event) => onUpdateFilter("category", event.target.value)}
            className="mt-2 h-11 w-full rounded-[22px] border border-slate-200 bg-white px-4 text-sm outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          >
            <option value="">全部品类</option>
            {comparison.categories.map((category) => (
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
            className="mt-2 h-11 w-full rounded-[22px] border border-slate-200 bg-white px-4 text-sm outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            placeholder="物料名称、标准名或规格"
          />
        </label>

        <button
          type="button"
          onClick={onReset}
          className="motion-lift mt-6 h-11 rounded-[22px] border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 active:scale-[0.98]"
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
    "产品",
    "供应商",
    "文件",
    "原行号",
    "物料名称",
    "匹配名",
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
      row.productName,
      row.supplierName,
      row.sourceFileName,
      row.rowNumber,
      row.materialName,
      row.normalizedName,
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

function toComparisonCsv(comparison: ReturnType<typeof buildCostComparison>, outputNameSupplier: string): string {
  const supplierHeaders = comparison.activeSuppliers.map((supplier) => `${supplier}报价`);
  const headers = ["分类", "名称", "规格描述", ...supplierHeaders, "差值", "百分比", "产品", "覆盖供应商"];
  const body: string[][] = [];

  comparison.categories.forEach((category) => {
    const categoryItems = comparison.materialComparisons.filter((item) => item.category === category);
    if (categoryItems.length === 0) return;

    const categoryValues = comparison.activeSuppliers.map((supplier) =>
      categoryItems.reduce((sum, item) => sum + getSupplierAmount(item, supplier), 0)
    );
    const categoryDiff = getPairDiff(categoryValues);
    body.push([
      category,
      "分类合计",
      "",
      ...categoryValues,
      categoryDiff.diff,
      Number.isFinite(categoryDiff.rate) ? `${(categoryDiff.rate * 100).toFixed(1)}%` : "",
      "",
      `${categoryItems.reduce((sum, item) => sum + item.suppliers.length, 0)}/${categoryItems.length * comparison.activeSuppliers.length}`
    ].map(escapeCsv));

    categoryItems.forEach((item) => {
      const values = comparison.activeSuppliers.map((supplier) => getSupplierAmount(item, supplier));
      const diff = getPairDiff(values);
      body.push([
        category,
        getOutputMaterialName(item, comparison.activeSuppliers, outputNameSupplier),
        getOutputSpec(item, comparison.activeSuppliers, outputNameSupplier),
        ...values.map((value) => (value > 0 ? value : "")),
        diff.diff,
        Number.isFinite(diff.rate) ? `${(diff.rate * 100).toFixed(1)}%` : "",
        item.productName,
        `${item.suppliers.length}/${comparison.activeSuppliers.length}`
      ].map(escapeCsv));
    });
  });

  body.push(
    summaryCsvRow("材料成本合计", comparison.totals.materialTotals, comparison.activeSuppliers),
    summaryCsvRow("人工/管理/利润合计", comparison.totals.derivedOverheadTotals, comparison.activeSuppliers),
    summaryCsvRow("出厂价", comparison.totals.factoryPriceTotals, comparison.activeSuppliers)
  );

  return `\uFEFF${[headers.map(escapeCsv), ...body].map((line) => line.join(",")).join("\n")}`;
}
function getSupplierAmount(item: ReturnType<typeof buildCostComparison>["materialComparisons"][number], supplier: string): number {
  return item.suppliers.find((entry) => entry.supplierName === supplier)?.amount ?? 0;
}

function getOutputMaterialName(
  item: ReturnType<typeof buildCostComparison>["materialComparisons"][number],
  suppliers: string[],
  outputNameSupplier: string
): string {
  const orderedSuppliers = outputNameSupplier
    ? [outputNameSupplier, ...suppliers.filter((supplier) => supplier !== outputNameSupplier)]
    : suppliers;
  const name = orderedSuppliers.map((supplier) => item.supplierMaterialNames[supplier]?.trim()).find(Boolean);
  if (name) return name;
  return item.rows.map((row) => row.materialName.trim()).filter(Boolean).join(" / ") || item.materialName;
}

function getOutputSpec(
  item: ReturnType<typeof buildCostComparison>["materialComparisons"][number],
  suppliers: string[],
  outputNameSupplier: string
): string {
  const orderedSuppliers = outputNameSupplier
    ? [outputNameSupplier, ...suppliers.filter((supplier) => supplier !== outputNameSupplier)]
    : suppliers;
  return orderedSuppliers.map((supplier) => item.supplierSpecs[supplier]?.trim()).find(Boolean) ?? "";
}

function getPairDiff(values: number[]): { diff: number | ""; rate: number } {
  if (values.length < 2 || values[0] <= 0) return { diff: "", rate: Number.NaN };
  const diff = values[1] - values[0];
  return { diff, rate: diff / values[0] };
}

function summaryCsvRow(label: string, totals: Record<string, number>, suppliers: string[]): string[] {
  const values = suppliers.map((supplier) => totals[supplier] ?? 0);
  const diff = getPairDiff(values);
  return [
    "总计核验",
    label,
    "",
    ...values.map((value) => (value > 0 ? value : "")),
    diff.diff,
    Number.isFinite(diff.rate) ? `${(diff.rate * 100).toFixed(1)}%` : "",
    "",
    "",
    ""
  ].map(escapeCsv);
}

function downloadCsv(csv: string, fileName: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, fileName);
}

function downloadBinary(data: ArrayBuffer, type: string, fileName: string) {
  downloadBlob(new Blob([data], { type }), fileName);
}

function downloadBlob(blob: Blob, fileName: string) {
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
