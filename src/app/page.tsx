"use client";

import { FormEvent, useCallback, useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { BomTable } from "@/components/BomTable";
import { CostDashboard } from "@/components/CostDashboard";
import { DetailsDialog } from "@/components/DetailsDialog";
import { IntegratedCostTable } from "@/components/IntegratedCostTable";
import { ManualAdjustmentBoard } from "@/components/ManualAdjustmentBoard";
import type { ManualGroup } from "@/components/ManualAdjustmentBoard";
import { MaterialPriceWarningPanel } from "@/components/MaterialPriceWarningPanel";
import { ResultReport } from "@/components/ResultReport";
import { SingleBomAnalysis } from "@/components/SingleBomAnalysis";
import { WorkspaceInteractionLayer } from "@/components/WorkspaceInteractionLayer";
import { parseBomFileInBrowser } from "@/lib/bom/browser-parser";
import { buildCostComparison, CostFilters, getComparisonObjectLabel, normalizeCostCategory } from "@/lib/bom/cost-comparison";
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

type WorkspaceView = "upload" | "adjust" | "single" | "compare" | "details" | "report" | "output";

type WorkspaceModule = "prepare" | "analysis" | "verify" | "deliver";

const VIEW_META: Record<WorkspaceView, { label: string; description: string; steps: string[] }> = {
  upload: {
    label: "上传文件",
    description: "把供应商报价或历史 BOM 放进来，系统会自动整理。",
    steps: ["可以一次选择多个 Excel 或 CSV。", "供应商和产品信息会优先从模板标题或文件名识别。", "导入后先到“整理物料”检查结果。"]
  },
  adjust: {
    label: "整理物料",
    description: "检查物料归类，把不同叫法整理到一起。",
    steps: ["先选择一家供应商。", "直接修改品类，或把物料拖到右侧品类。", "只需处理明显不一致的项目，其余结果会自动保存。"]
  },
  single: {
    label: "单份成本",
    description: "看清一份报价的钱花在哪里，以及合计是否一致。",
    steps: ["选择一份报价。", "点击成本结构中的品类，可在当前页查看该品类的物料金额与占比。", "需要追溯原始内容时，再点击下方物料表。"]
  },
  compare: {
    label: "多份比较",
    description: "比较不同供应商、产品或型号的成本差别。",
    steps: ["勾选需要比较的报价。", "点击品类图或成本结构图，可在当前页继续查看物料金额与占比。", "需要追溯原始内容时，再点击下方物料表。"]
  },
  details: {
    label: "明细检查",
    description: "查看每条物料，处理需要确认的数据和参考价差异。",
    steps: ["先用顶部条件找到目标物料。", "点击“待检查”或“原始内容”展开详情。", "修改后会重新检查数量、单价和金额。"]
  },
  report: {
    label: "分析结论",
    description: "快速了解谁更便宜、差异在哪里、先谈哪些项目。",
    steps: ["先看推荐结论和可节省金额。", "按品类和物料的优先级准备谈价。", "数据不完整时，系统会先建议补齐而不是直接选供应商。"]
  },
  output: {
    label: "导出结果",
    description: "选择沟通对象，生成可以直接核对和讨论的表格。",
    steps: ["选择准备沟通的供应商。", "导出的物料名优先采用该供应商的叫法。", "核价表保留规格、差值、品类合计和最终报价。"]
  }
};

const WORKSPACE_MODULES: Array<{
  id: WorkspaceModule;
  label: string;
  eyebrow: string;
  views: WorkspaceView[];
}> = [
  { id: "prepare", label: "准备报价", eyebrow: "01", views: ["upload", "adjust"] },
  { id: "analysis", label: "查看成本", eyebrow: "02", views: ["single", "compare"] },
  { id: "verify", label: "检查明细", eyebrow: "03", views: ["details"] },
  { id: "deliver", label: "结论与导出", eyebrow: "04", views: ["report", "output"] }
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
  const [isViewHelpOpen, setIsViewHelpOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [, startFilterTransition] = useTransition();

  const rows = useMemo(() => records.flatMap((record) => record.rows), [records]);
  const quoteRows = useMemo(() => rows.filter((row) => row.kind === "supplier_quote"), [rows]);
  const deferredFilters = useDeferredValue(filters);
  const comparison = useMemo(() => buildCostComparison(rows, deferredFilters), [rows, deferredFilters]);
  const categoryOptions = useMemo(
    () => buildCategoryOptionsForFilters(rows, filters),
    [filters, rows]
  );
  const issueRows = useMemo(
    () => comparison.filteredRows.filter((row) => row.dataIssues.length > 0),
    [comparison.filteredRows]
  );
  const issueCount = useMemo(
    () => comparison.filteredRows.reduce((sum, row) => sum + row.dataIssues.length, 0),
    [comparison.filteredRows]
  );
  const visibleRows = detailSelection?.rows ?? comparison.filteredRows;
  const marketPriceByRowId = useMemo(
    () => Object.fromEntries((marketPriceResult?.comparisons ?? []).map((item) => [item.rowId, item])),
    [marketPriceResult]
  );
  const refresh = useCallback(() => {
    setRecords(loadLocalRecords());
    setManualCategories(loadLocalArray<string>(LOCAL_MANUAL_CATEGORIES_KEY));
    setManualGroups(loadLocalArray<ManualGroup>(LOCAL_MANUAL_GROUPS_KEY));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function toggleSidebar() {
    setIsSidebarOpen((current) => !current);
  }

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
    const quoteObjectCount = new Set(result.records.flatMap((record) => record.rows.map(getComparisonObjectLabel))).size;
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

  function updateSingleRow(rowId: string, patch: Partial<CanonicalBomRow>) {
    const nextRecords = records.map((record) => ({
      ...record,
      rows: record.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    }));
    saveLocalRecords(nextRecords);
    setRecords(nextRecords);
    setDetailSelection((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
          }
        : current
    );
  }

  function deleteSingleRow(rowId: string) {
    const nextRecords = records
      .map((record) => ({
        ...record,
        rows: record.rows.filter((row) => row.id !== rowId)
      }))
      .filter((record) => record.rows.length > 0)
      .map((record) => ({ ...record, rowCount: record.rows.length }));
    saveLocalRecords(nextRecords);
    setRecords(nextRecords);
    setDetailSelection((current) =>
      current
        ? {
            ...current,
            rows: current.rows.filter((row) => row.id !== rowId)
          }
        : current
    );
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
    startFilterTransition(() => {
      setFilters((current) => ({ ...current, [key]: value }));
      setDetailSelection(null);
    });
  }

  function focusCostDashboard() {
    window.setTimeout(() => {
      document.getElementById("cost-dashboard-focus")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 0);
  }

  function selectChartCategory(category: string) {
    startFilterTransition(() => {
      setFilters((current) => ({ ...current, category, materialQuery: "" }));
      setDetailSelection(null);
    });
    focusCostDashboard();
  }

  function selectChartMaterial(materialName: string) {
    startFilterTransition(() => {
      setFilters((current) => ({ ...current, materialQuery: materialName }));
      setDetailSelection(null);
    });
    focusCostDashboard();
  }

  function selectChartSupplier(supplierName: string) {
    startFilterTransition(() => {
      setFilters((current) => ({ ...current, supplierNames: [supplierName] }));
      setDetailSelection(null);
    });
    focusCostDashboard();
  }

  function setSupplierChecked(nextSupplierName: string, checked: boolean) {
    const allSuppliers = comparison.suppliers;
    startFilterTransition(() => {
      setFilters((current) => {
        const base = current.supplierNames.length === 0 ? allSuppliers : current.supplierNames;
        const next = checked
          ? Array.from(new Set([...base, nextSupplierName]))
          : base.filter((supplier) => supplier !== nextSupplierName);

        return {
          ...current,
          supplierNames: next.length === allSuppliers.length ? [] : next
        };
      });
      setDetailSelection(null);
    });
  }

  function selectAllSuppliers() {
    startFilterTransition(() => {
      setFilters((current) => ({ ...current, supplierNames: [] }));
      setDetailSelection(null);
    });
  }

  function resetFilters() {
    startFilterTransition(() => {
      setFilters({ supplierNames: [], productName: "", category: "", materialQuery: "" });
      setDetailSelection(null);
    });
  }

  function showIssueRows() {
    if (issueRows.length === 0) return;
    setDetailSelection({
      rows: issueRows,
      title: `待检查：${issueRows.length} 行 / ${issueCount} 个问题`
    });
    setActiveView("details");
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
      setMarketPriceError("无法读取材料参考价 URL。目标网页可能禁止跨域抓取，可改用上传价格表或接入返回 prices JSON 的 API。");
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
      setPriceSourceMessage(`已载入 ${file.name}，共 ${prices.length} 条参考价。系统将优先使用该价格表核价。`);
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
    setPriceSourceMessage("已清空上传价格表，将使用 URL 网页/API 或内置近期原材料参考库。");
  }

  function exportTemplateExcel() {
    const data = buildTemplateOutputArray(comparison, outputNameSupplier);
    downloadBinary(
      data,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      `bom-template-output-${today()}.xlsx`
    );
  }

  const activeModule =
    WORKSPACE_MODULES.find((module) => module.views.includes(activeView)) ??
    WORKSPACE_MODULES[0];
  const activeViewMeta = VIEW_META[activeView];

  return (
    <main
      className="min-h-screen overflow-x-hidden bg-transparent"
      data-workspace-root
      data-workspace-view={activeView}
    >
      <WorkspaceInteractionLayer />
      <button
        type="button"
        className={`sidebar-floating-toggle ${isSidebarOpen ? "is-open" : ""}`}
        onClick={toggleSidebar}
        aria-label={isSidebarOpen ? "关闭导航栏" : "打开导航栏"}
        aria-expanded={isSidebarOpen}
        aria-controls="workspace-sidebar-panel"
        title={isSidebarOpen ? "关闭导航栏" : "打开导航栏"}
      >
        <span aria-hidden="true">{isSidebarOpen ? "‹" : "›"}</span>
      </button>
      <div
        className={`page-shell mx-auto grid w-full max-w-[1680px] gap-4 px-3 py-3 sm:px-4 sm:py-4 ${isSidebarOpen ? "sidebar-open" : ""}`}
      >
        <aside className="workspace-sidebar" aria-label="主导航">
          <div id="workspace-sidebar-panel" className="sidebar-shell reveal-in flex flex-col rounded-[24px] p-3">
            <div className="brand-panel rounded-[14px] p-5 text-white">
              <h1 className="type-brand-title text-balance">AI 成本核验</h1>
              <p className="type-body mt-2 text-white/64">把多份 BOM 变成清晰的成本结论</p>
            </div>

            <nav className="mt-3 grid gap-1" aria-label="工作流导航">
              {WORKSPACE_MODULES.map((module) => {
                const active = module.id === activeModule.id;
                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => {
                      if (!active) setActiveView(module.views[0]);
                      setIsSidebarOpen(false);
                    }}
                    data-active={active}
                    aria-label={module.label}
                    className={`nav-row group flex cursor-pointer items-center justify-between rounded-[10px] px-4 py-3 pl-5 text-left transition duration-200 active:scale-[0.99] ${
                      active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className={`type-micro ${active ? "text-white/50" : "text-slate-400"}`}>{module.eyebrow}</span>
                      <span className="type-nav">{module.label}</span>
                    </span>
                    <span className={`h-2 w-2 rounded-full ${active ? "bg-sky-300" : "bg-slate-300 group-hover:bg-slate-500"}`} />
                  </button>
                );
              })}
            </nav>

            <div className="sidebar-stats mt-5 grid grid-cols-2 gap-2">
              <MiniStat label="报价" value={comparison.suppliers.length.toString()} />
              <MiniStat label="物料" value={comparison.materialComparisons.length.toString()} />
              <MiniStat label="明细" value={comparison.filteredRows.length.toString()} />
              <MiniStat label="待检查" value={issueRows.length.toString()} tone={issueCount > 0 ? "danger" : "normal"} onClick={showIssueRows} />
            </div>
          </div>
        </aside>

        <section className="workspace-content grid min-w-0 max-w-full auto-rows-max content-start gap-4 overflow-hidden">
          <header className="page-header reveal-in flex h-fit min-h-0 items-center overflow-hidden px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              {activeModule.views.length > 1 ? (
                <div
                  className="workspace-title-switcher inline-flex max-w-full gap-1 overflow-x-auto rounded-[12px] border border-slate-300 bg-slate-100/90 p-1.5"
                  role="tablist"
                  aria-label={`${activeModule.label}子页面`}
                >
                  {activeModule.views.map((view) => {
                    const active = activeView === view;
                    return (
                      <button
                        key={view}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setActiveView(view)}
                        className={`min-w-[132px] cursor-pointer whitespace-nowrap rounded-[9px] px-5 py-2.5 font-bold transition duration-200 ${
                          active
                            ? "bg-slate-950 text-[1.2rem] text-white shadow-[0_5px_14px_rgba(15,23,42,0.18)]"
                            : "text-[0.92rem] text-slate-500 hover:bg-white hover:text-slate-900"
                        }`}
                      >
                        {VIEW_META[view].label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <h2 className="type-page-title text-ink">{activeViewMeta.label}</h2>
              )}
              <button
                type="button"
                onClick={() => setIsViewHelpOpen(true)}
                className="cursor-pointer rounded-[8px] border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-ink"
              >
                页面说明
              </button>
            </div>
          </header>
          <DetailsDialog
            open={isViewHelpOpen}
            title={activeViewMeta.label}
            eyebrow={activeModule.label}
            onClose={() => setIsViewHelpOpen(false)}
          >
            <p className="type-body text-slate-600">{activeViewMeta.description}</p>
            <ol className="mt-4 grid gap-2">
              {activeViewMeta.steps.map((step, index) => (
                <li key={step} className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-3 rounded-[10px] bg-slate-50 p-3 text-sm text-slate-700">
                  <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-white font-semibold text-ink ring-1 ring-slate-200">{index + 1}</span>
                  <span className="pt-0.5 leading-6">{step}</span>
                </li>
              ))}
            </ol>
          </DetailsDialog>

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
                categoryOptions={categoryOptions}
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
                onSelectCategory={selectChartCategory}
                onSelectMaterial={selectChartMaterial}
                onSelectSupplier={selectChartSupplier}
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

          {activeView === "single" && (
            <SingleBomAnalysis
              rows={quoteRows}
              onInspectRows={(selectedRows, title) => {
                setDetailSelection({ rows: selectedRows, title });
                setActiveView("details");
              }}
            />
          )}

          {activeView === "details" && (
            <>
              <FilterPanel
                categoryOptions={categoryOptions}
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
              <section className="app-surface reveal-in min-w-0 max-w-full overflow-hidden rounded-[22px] p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">{detailSelection?.title ?? "当前明细"}</h3>
                    <p className="text-xs text-slate-500">可以排序、筛选和修改；需要时还能查看原始内容。</p>
                  </div>
                  {detailSelection && (
                    <button
                      onClick={() => setDetailSelection(null)}
                      className="button-secondary motion-lift rounded-[12px] px-4 py-2 text-sm font-semibold active:scale-[0.98]"
                    >
                      返回当前筛选
                    </button>
                  )}
                </div>
                <BomTable
                  rows={visibleRows}
                  priceComparisonsByRowId={marketPriceByRowId}
                  onUpdateRow={updateSingleRow}
                  onDeleteRow={deleteSingleRow}
                />
              </section>
            </>
          )}

          {activeView === "report" && (
            <>
              <FilterPanel
                categoryOptions={categoryOptions}
                comparison={comparison}
                filters={filters}
                onReset={resetFilters}
                onSelectAllSuppliers={selectAllSuppliers}
                onSupplierChecked={setSupplierChecked}
                onUpdateFilter={updateFilter}
              />
              <ResultReport
                comparison={comparison}
                selectedCategory={filters.category}
                onInspectRows={(selectedRows, title) => {
                  setDetailSelection({ rows: selectedRows, title });
                  setActiveView("details");
                }}
              />
            </>
          )}

          {activeView === "output" && (
            <section className="reveal-in grid min-w-0 max-w-full gap-4 overflow-hidden">
              <div className="app-surface rounded-[20px] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">导出结果</h3>
                    <p className="text-xs text-slate-500">选择准备沟通的供应商，表格会优先使用对方熟悉的物料名称。</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="field-shell flex items-center gap-2 rounded-[14px] px-3 py-2 text-xs font-semibold text-slate-600">
                      名称以谁为准
                      <select
                        value={outputNameSupplier}
                        onChange={(event) => setOutputNameSupplier(event.target.value)}
                        className="bg-transparent text-sm font-semibold text-ink outline-none"
                      >
                        <option value="">自动选择</option>
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
                      className="button-primary motion-lift rounded-[14px] px-5 py-2 text-sm font-semibold active:scale-[0.98]"
                    >
                      导出核价表
                    </button>
                  </div>
                </div>
              </div>
              <FilterPanel
                categoryOptions={categoryOptions}
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
  const suppliers = new Set(records.flatMap((record) => record.rows.map(getComparisonObjectLabel).filter(Boolean)));
  return {
    ...filters,
    productName: !filters.productName || products.has(filters.productName) ? filters.productName : "",
    supplierNames: filters.supplierNames.filter((supplier) => suppliers.has(supplier))
  };
}

function buildCategoryOptionsForFilters(rows: CanonicalBomRow[], filters: CostFilters): string[] {
  const query = filters.materialQuery.trim().toLowerCase();
  const categories = new Set<string>();

  rows.forEach((row) => {
    if (row.kind !== "supplier_quote") return;
    if (filters.supplierNames.length > 0 && !filters.supplierNames.includes(getComparisonObjectLabel(row))) return;
    if (filters.productName && row.productName !== filters.productName) return;
    if (query) {
      const materialText = `${row.materialName} ${row.normalizedName} ${row.manualName ?? ""} ${row.spec}`.toLowerCase();
      if (!materialText.includes(query)) return;
    }
    categories.add(normalizeCostCategory(row.category, row.materialName));
  });

  return Array.from(categories).sort((a, b) => a.localeCompare(b, "zh-CN"));
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
      ? "用于本次成本分析；同一供应商的不同产品或型号会分开显示。"
      : "作为以后比价的参考，不会加入本次报价比较。";

  return (
    <section className="reveal-in grid w-full gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
      <section className="quiet-surface rounded-[20px] p-4 xl:col-span-2">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="type-section-title text-ink">从一份 BOM 开始</h3>
            <p className="type-body mt-1 text-slate-500">
              直接上传已有文件，或先下载模板发给供应商填写。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsGuideOpen(true)}
              className="button-primary motion-lift rounded-[14px] px-5 py-3 text-sm font-semibold active:scale-[0.98]"
            >
              使用说明
            </button>
            <a
              href="/templates/bom-input-output-template.xlsx"
              download="BOM输入模板2.0.xlsx"
              className="button-secondary motion-lift rounded-[14px] px-5 py-3 text-sm font-semibold active:scale-[0.98]"
            >
              下载输入模板
            </a>
          </div>
        </div>
        {isGuideOpen && <UserGuideModal onClose={() => setIsGuideOpen(false)} />}
      </section>
      <form onSubmit={onSubmit} className="app-surface rounded-[20px] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="type-panel-title text-ink">导入到哪里</h3>
            <p className="type-caption mt-1 text-slate-500">{kindHelp}</p>
          </div>
          <div className="inline-flex rounded-[10px] bg-slate-100 p-1" role="group" aria-label="文件用途">
            <button
              type="button"
              onClick={() => onKindChange("supplier_quote")}
              className={`cursor-pointer rounded-[8px] px-4 py-2 text-sm font-semibold transition-colors ${
                kind === "supplier_quote" ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink"
              }`}
            >
              本次报价
            </button>
            <button
              type="button"
              onClick={() => onKindChange("historical_bom")}
              className={`cursor-pointer rounded-[8px] px-4 py-2 text-sm font-semibold transition-colors ${
                kind === "historical_bom" ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink"
              }`}
            >
              历史参考
            </button>
          </div>
        </div>

        <label className="mt-4 block rounded-[12px] border border-dashed border-slate-300 bg-slate-50 p-6 transition-colors duration-200 hover:border-slate-500 hover:bg-white">
          <span className="type-panel-title text-ink">选择 BOM 文件</span>
            <span className="type-caption ml-2 text-slate-500">可以一次选择多个 Excel 或 CSV</span>
          <input
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            onChange={(event) => {
              onFilesChange(mergePendingFiles(files, Array.from(event.target.files ?? [])));
              event.currentTarget.value = "";
            }}
            className="field-shell mt-4 w-full rounded-[14px] px-3 py-2 text-[13px] file:mr-3 file:rounded-[12px] file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white"
          />
          <div className="type-caption mt-4 grid min-h-6 gap-2 text-slate-500 sm:grid-cols-2 xl:grid-cols-3">
            {files.length > 0 ? (
              files.map((file) => (
                <span
                  key={getFileSourceSignature(file)}
                  className="inline-flex min-w-0 items-center justify-between gap-2 rounded-[14px] bg-white/84 px-3 py-2 ring-1 ring-slate-200"
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
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-[10px] text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    ×
                  </button>
                </span>
              ))
            ) : (
              <span>文件会在这里列出，确认后再开始导入。</span>
            )}
          </div>
        </label>

        <details className="mt-4 rounded-[10px] border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-600 hover:text-ink">
            填写供应商或文件备注（可选）
          </summary>
          <div className="grid gap-4 border-t border-slate-100 p-4 md:grid-cols-2">
            <label className="block">
              <span className="type-caption font-semibold text-slate-600">供应商</span>
              <input
                value={supplierName}
                onChange={(event) => onSupplierNameChange(event.target.value)}
                className="field-shell mt-2 h-11 w-full px-4 text-[13px] outline-none"
                placeholder="留空会自动识别"
              />
            </label>
            <label className="block">
              <span className="type-caption font-semibold text-slate-600">备注</span>
              <input
                value={productName}
                onChange={(event) => onProductNameChange(event.target.value)}
                className="field-shell mt-2 h-11 w-full px-4 text-[13px] outline-none"
                placeholder="例如：7 月报价；可以留空"
              />
            </label>
          </div>
        </details>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            disabled={isUploading}
            className="button-primary motion-lift rounded-[14px] px-6 py-3 text-sm font-semibold active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUploading ? "正在读取..." : "开始导入"}
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

      <div className="app-surface rounded-[20px] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="type-panel-title text-ink">已导入的文件</h3>
            <span className="type-caption text-slate-500">{records.length} 个文件</span>
          </div>
          <button
            type="button"
            onClick={onClear}
            disabled={records.length === 0 && files.length === 0}
            className="button-secondary motion-lift rounded-[12px] px-4 py-2 text-xs font-semibold active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          >
            全部清空
          </button>
        </div>
        <div className="mt-4 grid max-h-[520px] grid-cols-1 items-start gap-2 overflow-y-auto px-1 pb-1 sm:grid-cols-2">
          {records.map((record) => {
            const identities = buildImportedFileIdentities(record);
            return (
              <div
                key={record.id}
                className="relative min-w-0 overflow-hidden rounded-[12px] border border-slate-200 bg-slate-50/82 p-3 pr-9"
              >
                <button
                  type="button"
                  aria-label={`删除 ${record.fileName}`}
                  onClick={() => onDeleteRecord(record.id)}
                  className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-[10px] text-slate-400 transition hover:bg-white hover:text-slate-800 hover:ring-1 hover:ring-slate-200"
                >
                  ×
                </button>
                <p className="truncate text-sm font-semibold text-ink" title={record.fileName}>
                  {record.fileName}
                </p>
                <div className="mt-2 grid gap-1.5">
                  {identities.map((identity) => (
                    <div
                      key={identity.key}
                      className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs text-slate-600"
                      title={identity.fullLabel}
                    >
                      <span className="min-w-0 truncate font-semibold text-slate-800">{identity.supplierName}</span>
                      {identity.productName && (
                        <>
                          <span className="shrink-0 text-slate-300">·</span>
                          <span className="min-w-0 truncate">{identity.productName}</span>
                        </>
                      )}
                      {identity.modelAndColor && (
                        <>
                          <span className="shrink-0 text-slate-300">·</span>
                          <span className="min-w-0 truncate text-slate-500">{identity.modelAndColor}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {records.length === 0 && (
            <div className="empty-state rounded-[12px] p-8 text-center text-sm text-slate-500 sm:col-span-2">还没有导入文件</div>
          )}
        </div>
      </div>
    </section>
  );
}

function buildImportedFileIdentities(record: BomFileRecord) {
  const identities = new Map<
    string,
    {
      key: string;
      supplierName: string;
      productName: string;
      modelAndColor: string;
      fullLabel: string;
    }
  >();

  record.rows.forEach((row) => {
    const supplierName = cleanImportedIdentity(row.supplierName) || cleanImportedIdentity(record.supplierName) || "未识别供应商";
    const productName = cleanImportedIdentity(row.productName);
    const modelAndColor = [cleanImportedIdentity(row.productModel), cleanImportedIdentity(row.productColor)].filter(Boolean).join(" ");
    const key = [supplierName, productName, modelAndColor].join("::");
    if (identities.has(key)) return;
    identities.set(key, {
      key,
      supplierName,
      productName,
      modelAndColor,
      fullLabel: [supplierName, productName, modelAndColor].filter(Boolean).join(" / ")
    });
  });

  if (identities.size === 0) {
    const supplierName = cleanImportedIdentity(record.supplierName) || "未识别供应商";
    const productName = cleanImportedIdentity(record.productName);
    const key = [supplierName, productName].join("::");
    identities.set(key, {
      key,
      supplierName,
      productName,
      modelAndColor: "",
      fullLabel: [supplierName, productName].filter(Boolean).join(" / ")
    });
  }

  return Array.from(identities.values());
}

function cleanImportedIdentity(value: string | undefined) {
  const text = String(value ?? "").trim();
  return /^(未命名产品|未命名供应商|未指定产品)$/.test(text) ? "" : text;
}

function UserGuideModal({ onClose }: { onClose: () => void }) {
  const steps = [
    {
      title: "1. 准备报价",
      body: "上传报价文件，再到“整理物料”检查品类和不同叫法。"
    },
    {
      title: "2. 查看成本",
      body: "看一份报价的成本组成，或把多份报价放在一起比较。"
    },
    {
      title: "3. 检查明细",
      body: "确认数量、单价、金额和参考价；有问题的行可以直接修改。"
    },
    {
      title: "4. 得到结果",
      body: "先看分析结论，再导出可直接与供应商核对的 Excel。"
    }
  ];

  return (
    <DetailsDialog open title="怎么使用" eyebrow="使用手册" size="wide" onClose={onClose}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((step) => (
            <div key={step.title} className="rounded-[18px] bg-slate-50 p-3 ring-1 ring-slate-200">
              <h4 className="text-xs font-semibold text-ink">{step.title}</h4>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-[18px] bg-white p-4 text-xs leading-5 text-slate-500 ring-1 ring-slate-200">
          <p>
            系统会按“供应商、产品、型号和颜色”区分每份报价。同一供应商的不同产品也能单独比较；文件备注只用于查找，不会影响物料匹配。
          </p>
        </div>
    </DetailsDialog>
  );
}

function FilterPanel({
  categoryOptions,
  comparison,
  filters,
  onReset,
  onSelectAllSuppliers,
  onSupplierChecked,
  onUpdateFilter
}: {
  categoryOptions: string[];
  comparison: ReturnType<typeof buildCostComparison>;
  filters: CostFilters;
  onReset: () => void;
  onSelectAllSuppliers: () => void;
  onSupplierChecked: (supplierName: string, checked: boolean) => void;
  onUpdateFilter: (key: "productName" | "category" | "materialQuery", value: string) => void;
}) {
  return (
    <section className="page-header reveal-in min-w-0 max-w-full overflow-hidden rounded-[20px] p-4">
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(220px,1.2fr)_minmax(160px,1fr)_minmax(160px,1fr)_minmax(220px,2fr)_auto]">
        <div className="block min-w-0">
          <div className="flex items-center justify-between gap-3">
            <span className="type-caption font-semibold text-slate-600">选择报价</span>
            <button type="button" onClick={onSelectAllSuppliers} className="type-caption font-semibold text-ink hover:text-slate-500">
              全部
            </button>
          </div>
          <div className="mt-2 flex min-h-11 max-w-full flex-wrap items-center gap-2 overflow-auto rounded-[10px] bg-slate-50 p-1.5 ring-1 ring-slate-200">
            {comparison.suppliers.map((supplier) => {
              const checked = filters.supplierNames.length === 0 || filters.supplierNames.includes(supplier);
              return (
                <label key={supplier} className="group cursor-pointer text-[13px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onSupplierChecked(supplier, event.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="motion-lift inline-flex items-center gap-2 rounded-[8px] bg-white px-3 py-2 font-semibold ring-1 ring-slate-200 peer-checked:bg-slate-950 peer-checked:text-white peer-checked:ring-slate-950">
                    <span className={`h-1.5 w-1.5 rounded-full ${checked ? "bg-white" : "bg-slate-300"}`} />
                    {supplier}
                  </span>
                </label>
              );
            })}
            {comparison.suppliers.length === 0 && <span className="px-2 text-sm text-slate-400">上传报价 BOM 后可筛选</span>}
          </div>
        </div>

        <label className="block min-w-0">
          <span className="type-caption font-semibold text-slate-500">产品</span>
          <select
            value={filters.productName}
            onChange={(event) => onUpdateFilter("productName", event.target.value)}
            className="field-shell mt-2 h-11 w-full rounded-[14px] px-4 text-[13px] outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          >
            <option value="">全部产品</option>
            {comparison.products.map((product) => (
              <option key={product} value={product}>
                {product}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0">
          <span className="type-caption font-semibold text-slate-500">品类</span>
          <select
            value={filters.category}
            onChange={(event) => onUpdateFilter("category", event.target.value)}
            className="field-shell mt-2 h-11 w-full rounded-[14px] px-4 text-[13px] outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          >
            <option value="">全部品类</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0">
          <span className="type-caption font-semibold text-slate-500">搜索物料</span>
          <input
            value={filters.materialQuery}
            onChange={(event) => onUpdateFilter("materialQuery", event.target.value)}
            className="field-shell mt-2 h-11 w-full rounded-[14px] px-4 text-[13px] outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            placeholder="输入物料名称或规格"
          />
        </label>

        <button
          type="button"
          onClick={onReset}
          className="button-secondary motion-lift mt-6 h-11 rounded-[14px] px-5 text-sm font-semibold active:scale-[0.98]"
        >
          清除筛选
        </button>
      </div>
    </section>
  );
}

function MiniStat({
  label,
  value,
  tone = "normal",
  onClick
}: {
  label: string;
  value: string;
  tone?: "normal" | "danger";
  onClick?: () => void;
}) {
  const Element = onClick ? "button" : "div";
  return (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-[10px] bg-slate-50 p-3 text-left ring-1 ring-slate-200 ${
        onClick ? "motion-lift cursor-pointer transition hover:bg-white active:scale-[0.98]" : ""
      }`}
    >
      <p className="type-micro text-slate-500">{label}</p>
      <p className={`mt-1 text-[1.35rem] font-bold leading-none ${tone === "danger" ? "text-danger" : "text-ink"}`}>{value}</p>
    </Element>
  );
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
