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
    <section className="rounded-[24px] bg-slate-950 p-4 text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/70">
            常规材料价格接口
          </div>
          <h3 className="mt-3 text-lg font-semibold">供应商报价 vs 材料参考价</h3>
          <p className="mt-1 text-sm text-white/58">
            {result
              ? `${result.sourceName}，更新时间 ${formatDate(result.generatedAt)}`
              : `待刷新：将对当前筛选范围内 ${rowCount} 行 BOM 做行情核验。`}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading || rowCount === 0}
          className="motion-lift rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-950 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "刷新中..." : "刷新材料价格"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
        <label className="block">
          <span className="text-xs font-semibold text-white/54">价格接口 URL</span>
          <input
            value={providerUrl}
            onChange={(event) => onProviderUrlChange(event.target.value)}
            className="mt-2 h-10 w-full rounded-[14px] border border-white/10 bg-white/8 px-3 text-sm text-white outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] placeholder:text-white/28 focus:border-white/30"
            placeholder="https://example.com/material-price-api"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-white/54">上传材料价格表</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(event) => onPriceFileChange(event.target.files?.[0] ?? null)}
            className="mt-2 h-10 w-full rounded-[14px] bg-white/8 px-3 py-1.5 text-sm text-white file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-1 file:text-xs file:font-semibold file:text-slate-950"
          />
        </label>

        <button
          type="button"
          onClick={onClearUploadedPrices}
          disabled={uploadedPriceCount === 0}
          className="motion-lift mt-5 h-10 rounded-full border border-white/16 px-4 text-sm font-semibold text-white/76 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          清空价格表
        </button>
      </div>

      {(sourceMessage || uploadedPriceCount > 0 || priceFileName) && (
        <div className="mt-3 rounded-[18px] bg-white/7 p-3 text-xs text-white/62 ring-1 ring-white/10">
          {sourceMessage || `已载入 ${priceFileName}，共 ${uploadedPriceCount} 条参考价。上传价格表优先于 URL 接口。`}
        </div>
      )}

      <div className="mt-4 grid gap-2 md:grid-cols-4">
        <Signal label="已核价" value={comparisons.length.toString()} />
        <Signal label="高风险" value={highCount.toString()} tone={highCount > 0 ? "danger" : "normal"} />
        <Signal label="需核验" value={mediumCount.toString()} tone={mediumCount > 0 ? "warn" : "normal"} />
        <Signal label="无参考价" value={missingCount.toString()} tone={missingCount > 0 ? "warn" : "normal"} />
      </div>

      {error && <div className="mt-4 rounded-[18px] bg-red-500/12 p-3 text-sm text-red-100 ring-1 ring-red-300/20">{error}</div>}

      {warningRows.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-[18px] bg-white/7 ring-1 ring-white/10">
          <table className="min-w-full text-left text-xs">
            <thead className="text-white/48">
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
                <tr key={item.rowId} className="border-t border-white/10">
                  <td className="max-w-[220px] truncate px-3 py-2 font-semibold text-white">{item.materialName}</td>
                  <td className="px-3 py-2 text-right text-white/72">{formatMoney(item.supplierUnitPrice)}</td>
                  <td className="px-3 py-2 text-right text-white/72">
                    {item.referenceUnitPrice === undefined ? "-" : formatMoney(item.referenceUnitPrice)}
                  </td>
                  <td className="px-3 py-2 text-right text-white/72">
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
  const color = tone === "danger" ? "text-red-200" : tone === "warn" ? "text-amber-200" : "text-white";
  return (
    <div className="rounded-[18px] bg-white/7 p-3 ring-1 ring-white/10">
      <p className="text-[11px] font-semibold text-white/48">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function riskLabel(item: MaterialPriceComparison): string {
  if (item.status === "not_found") return "无参考";
  if (item.status === "unit_mismatch") return "单位核验";
  if (item.riskLevel === "high") return "高风险";
  if (item.riskLevel === "medium") return "需核验";
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
