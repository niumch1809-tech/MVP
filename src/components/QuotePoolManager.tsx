"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DetailsDialog } from "@/components/DetailsDialog";

export type QuotePoolItem = {
  label: string;
  supplierName: string;
  productLabel: string;
  fileNames: string[];
  rowCount: number;
};

type Props = {
  open: boolean;
  items: QuotePoolItem[];
  selectedLabels: string[];
  onChange: (labels: string[]) => void;
  onClose: () => void;
};

export function QuotePoolManager({ open, items, selectedLabels, onChange, onClose }: Props) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selectedLabels), [selectedLabels]);
  const visibleItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      [item.label, item.supplierName, item.productLabel, ...item.fileNames]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [items, query]);
  const selectedItems = useMemo(
    () => selectedLabels.map((label) => items.find((item) => item.label === label)).filter((item): item is QuotePoolItem => Boolean(item)),
    [items, selectedLabels]
  );

  function addQuote(label: string) {
    if (selectedSet.has(label)) return;
    onChange([...selectedLabels, label]);
  }

  function removeQuote(label: string) {
    onChange(selectedLabels.filter((item) => item !== label));
  }

  return (
    <DetailsDialog open={open} title="选择本次核价的 BOM" eyebrow="报价池" size="full" onClose={onClose}>
      <div className="rounded-[14px] border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm leading-6 text-slate-600">
        所有文件会保留在“全部 BOM”中。只有加入“本次核价”的报价，才会出现在物料整理、对齐、分析、明细和导出页面。
      </div>

      <div className="mt-4 grid min-h-[480px] gap-4 xl:grid-cols-2">
        <PoolColumn
          title="全部 BOM"
          count={items.length}
          description="长期保存的全部报价"
          action={
            <button
              type="button"
              onClick={() => onChange(items.map((item) => item.label))}
              disabled={items.length === 0 || selectedLabels.length === items.length}
              className="button-secondary rounded-[10px] px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              全部加入
            </button>
          }
        >
          <label className="block">
            <span className="sr-only">搜索全部 BOM</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="field-shell h-10 w-full rounded-[11px] px-3 text-sm outline-none"
              placeholder="搜索供应商、产品、型号或文件名"
            />
          </label>
          <div className="mt-3 grid max-h-[52dvh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {visibleItems.map((item) => {
              const selected = selectedSet.has(item.label);
              return (
                <QuotePoolCard
                  key={item.label}
                  item={item}
                  selected={selected}
                  actionLabel={selected ? "已加入" : "加入"}
                  onAction={() => addQuote(item.label)}
                />
              );
            })}
            {visibleItems.length === 0 && (
              <p className="rounded-[12px] bg-slate-50 p-8 text-center text-sm text-slate-400 sm:col-span-2">
                {items.length === 0 ? "还没有导入报价 BOM" : "没有找到匹配的 BOM"}
              </p>
            )}
          </div>
        </PoolColumn>

        <PoolColumn
          title="本次核价"
          count={selectedItems.length}
          description="后续页面只使用这里的报价"
          action={
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={selectedItems.length === 0}
              className="button-secondary rounded-[10px] px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              清空本次
            </button>
          }
        >
          <div className="grid max-h-[calc(52dvh+52px)] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {selectedItems.map((item) => (
              <QuotePoolCard
                key={item.label}
                item={item}
                selected
                actionLabel="移出"
                onAction={() => removeQuote(item.label)}
              />
            ))}
            {selectedItems.length === 0 && (
              <div className="grid min-h-52 place-items-center rounded-[14px] border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center sm:col-span-2">
                <div>
                  <p className="text-sm font-semibold text-slate-700">本次核价还没有 BOM</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">从左侧选择要整理、比较和导出的报价。</p>
                </div>
              </div>
            )}
          </div>
        </PoolColumn>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-500">已选择 {selectedItems.length} / {items.length} 份报价</p>
        <button type="button" onClick={onClose} className="button-primary rounded-[12px] px-5 py-2.5 text-sm font-semibold">
          完成
        </button>
      </div>
    </DetailsDialog>
  );
}

function PoolColumn({
  title,
  count,
  description,
  action,
  children
}: {
  title: string;
  count: number;
  description: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-[16px] border border-slate-200 bg-white p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-base font-semibold text-slate-900">{title}</h4>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">{count} 份</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function QuotePoolCard({
  item,
  selected,
  actionLabel,
  onAction
}: {
  item: QuotePoolItem;
  selected: boolean;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <article className={`min-w-0 rounded-[12px] border p-3 transition ${selected ? "border-sky-200 bg-sky-50/60" : "border-slate-200 bg-white hover:border-slate-300"}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900" title={item.label}>{item.label}</p>
          <p className="mt-1 truncate text-xs text-slate-500" title={item.fileNames.join(" / ")}>{item.fileNames.join(" / ")}</p>
        </div>
        <button
          type="button"
          onClick={onAction}
          disabled={selected && actionLabel === "已加入"}
          className={`shrink-0 rounded-[9px] px-2.5 py-1.5 text-[11px] font-semibold transition ${
            actionLabel === "移出"
              ? "bg-white text-slate-500 ring-1 ring-slate-200 hover:text-red-600"
              : selected
                ? "bg-sky-100 text-sky-700"
                : "bg-slate-950 text-white hover:bg-slate-800"
          } disabled:cursor-default`}
        >
          {actionLabel}
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-400">
        <span className="truncate" title={item.productLabel || item.supplierName}>{item.productLabel || item.supplierName}</span>
        <span className="shrink-0">{item.rowCount} 行</span>
      </div>
    </article>
  );
}
