"use client";

import { useState } from "react";

type Props = {
  targetId: string;
  reportTitle: string;
  fileName: string;
};

export function PdfExportButton({ targetId, reportTitle, fileName }: Props) {
  const [isPreparing, setIsPreparing] = useState(false);

  function exportPdf() {
    const target = document.getElementById(targetId);
    if (!target || isPreparing) return;

    setIsPreparing(true);
    const originalTitle = document.title;
    const portal = document.createElement("div");
    portal.className = "pdf-print-portal";
    portal.setAttribute("aria-label", reportTitle);

    const content = target.cloneNode(true) as HTMLElement;
    content.removeAttribute("id");
    content.setAttribute("aria-hidden", "false");
    portal.append(content);
    document.body.appendChild(portal);
    document.body.classList.add("pdf-printing");
    document.title = sanitizeFileName(fileName);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      window.removeEventListener("afterprint", cleanup);
      portal.remove();
      document.body.classList.remove("pdf-printing");
      document.title = originalTitle;
      setIsPreparing(false);
    };

    window.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(cleanup, 60_000);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  }

  return (
    <button
      type="button"
      onClick={exportPdf}
      disabled={isPreparing}
      className="cursor-pointer rounded-[8px] border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
      title="生成专用报告版式，并打开系统打印窗口保存为 PDF"
    >
      {isPreparing ? "正在生成…" : "导出 PDF"}
    </button>
  );
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").trim() || "AI成本核验报告";
}
