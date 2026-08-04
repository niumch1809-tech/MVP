"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  title: string;
  eyebrow?: string;
  size?: "default" | "wide" | "full";
  children: ReactNode;
  onClose: () => void;
};

export function DetailsDialog({ open, title, eyebrow = "说明", size = "default", children, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/30 p-3 backdrop-blur-[2px] sm:p-5">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto rounded-[16px] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(31,35,40,0.16)] sm:max-h-[88dvh] ${
          size === "full" ? "max-w-[min(1500px,calc(100vw-2rem))]" : size === "wide" ? "max-w-5xl" : "max-w-2xl"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="type-micro text-slate-500">{eyebrow}</p>
            <h3 className="mt-1 text-xl font-semibold text-ink">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-[9px] border border-slate-200 bg-white text-lg text-slate-500 transition-colors hover:bg-slate-50 hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </section>
    </div>,
    document.body
  );
}
