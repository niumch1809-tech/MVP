"use client";

import { MaterialPriceComparison, MaterialPriceQuoteResponse } from "@/types/bom";

type Props = {
  result: MaterialPriceQuoteResponse | null;
  isLoading: boolean;
  error: string;
  rowCount: number;
  providerUrl: string;
  uploadedPriceCount: number;
  priceFileName: string;
  sourceMessage: string;
  onProviderUrlChange: (value: string) => void;
  onPriceFileChange: (file: File | null) => void;
  onClearUploadedPrices: () => void;
  onRefresh: () => void;
};

export function MaterialPriceWarningPanel({
  result,
  isLoading,
  error,
  rowCount,
  providerUrl,
  uploadedPriceCount,
  priceFileName,
  sourceMessage,
  onProviderUrlChange,
  onPriceFileChange,
  onClearUploadedPrices,
  onRefresh
}: Props) {
  const comparisons = result?.comparisons ?? [];
  const highCount = comparisons.filter((item) => item.riskLevel === "high").length;
  const mediumCount = comparisons.filter((item) => item.riskLevel === "medium").length;
  const missingCount = comparisons.filter((item) => item.status === "not_found").length;
  const warningRows = comparisons
    .filter((item) => item.riskLevel === "high" || item.riskLevel === "medium" || item.status !== "matched")
    .slice(0, 8);

  return (
    <section className="app-surface min-w-0 max-w-full overflow-hidden p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="type-section-title text-ink">和材料参考价比一比</h3>
          <p className="type-body mt-1 text-slate-500">
            {result
              ? `${result.sourceName}，更新时间 ${formatDate(result.generatedAt)}`
              : `可以使用内置参考、价格表或网页地址，对比当前 ${rowCount} 行物料。`}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading || rowCount === 0}
          className="button-primary motion-lift px-5 py-2 text-[13px] font-semibold active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
            {isLoading ? "正在查找..." : "更新参考价"}
        </button>
      </div>

      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="block min-w-0">
          <span className="type-caption font-semibold text-slate-600">价格网页（可选）</span>
          <input
            value={providerUrl}
            onChange={(event) => onProviderUrlChange(event.target.value)}
            className="field-shell mt-2 h-10 w-full px-3 text-[13px] text-ink outline-none"
            placeholder="粘贴材料价格网页或数据接口"
          />
        </label>

        <label className="block min-w-0">
          <span className="type-caption font-semibold text-slate-600">自己的价格表（可选）</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(event) => onPriceFileChange(event.target.files?.[0] ?? null)}
            className="field-shell mt-2 h-10 w-full px-3 py-1.5 text-[13px] text-slate-600 file:mr-3 file:rounded-[8px] file:border-0 file:bg-slate-950 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white"
          />
        </label>

        <button
          type="button"
          onClick={onClearUploadedPrices}
          disabled={uploadedPriceCount === 0}
          className="button-secondary motion-lift mt-5 h-10 px-4 text-[13px] font-semibold active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          清空价格表
        </button>
      </div>

      {(sourceMessage || uploadedPriceCount > 0 || priceFileName) && (
        <div className="type-caption mt-3 rounded-[10px] bg-slate-50 p-3 text-slate-600 ring-1 ring-slate-200">
          {sourceMessage || `已载入 ${priceFileName}，共 ${uploadedPriceCount} 条参考价。优先使用上传价格表，再读取 URL。`}
        </div>
      )}

      <div className="mt-4 grid gap-2 md:grid-cols-4">
        <Signal label="已比较" value={comparisons.length.toString()} />
        <Signal label="差异较大" value={highCount.toString()} tone={highCount > 0 ? "danger" : "normal"} />
        <Signal label="建议确认" value={mediumCount.toString()} tone={mediumCount > 0 ? "warn" : "normal"} />
        <Signal label="暂无参考" value={missingCount.toString()} tone={missingCount > 0 ? "warn" : "normal"} />
      </div>

      {error && <div className="mt-4 rounded-[10px] bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-100">{error}</div>}

      {warningRows.length > 0 && (
        <div className="mt-4 max-w-full overflow-auto rounded-[10px] border border-slate-200 bg-white">
          <table className="type-table resizable-table min-w-[760px] text-left">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">物料</th>
                <th className="px-3 py-2 text-right font-semibold">供应商单价</th>
                <th className="px-3 py-2 text-right font-semibold">参考价</th>
                <th className="px-3 py-2 text-right font-semibold">差异</th>
                <th className="px-3 py-2 text-right font-semibold">风险</th>
              </tr>
            </thead>
            <tbody>
              {warningRows.map((item) => (
                <tr key={item.rowId} className="border-t border-slate-100">
                  <td className="max-w-[220px] truncate px-3 py-2 font-semibold text-ink">{item.materialName}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{formatMoney(item.supplierUnitPrice)}</td>
                  <td className="px-3 py-2 text-right text-slate-600">
                    {item.referenceUnitPrice === undefined ? "-" : formatMoney(item.referenceUnitPrice)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">
                    {item.differenceRate === undefined ? "-" : formatPercent(item.differenceRate)}
                  </td>
                  <td className="px-3 py-2 text-right">{riskLabel(item)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Signal({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "warn" | "danger" }) {
  const color = tone === "danger" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-ink";
  return (
    <div className="rounded-[10px] bg-slate-50 p-3 ring-1 ring-slate-200">
      <p className="type-micro text-slate-500">{label}</p>
      <p className={`mt-1 text-[1.7rem] font-bold leading-none ${color}`}>{value}</p>
    </div>
  );
}

function riskLabel(item: MaterialPriceComparison): string {
  if (item.status === "not_found") return "暂无参考";
  if (item.status === "unit_mismatch") return "单位不同";
  if (item.riskLevel === "high") return "差异较大";
  if (item.riskLevel === "medium") return "建议确认";
  if (item.riskLevel === "low") return "轻微偏离";
  return "接近行情";
}

function formatMoney(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("zh-CN", { style: "percent", maximumFractionDigits: 1 }) : "0%";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
