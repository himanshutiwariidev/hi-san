"use client";

import { useEffect } from "react";

export default function Modal({ title, description, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#0b102373] p-6"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`grid max-h-[min(720px,calc(100vh-48px))] w-full gap-4 overflow-auto rounded-[22px] border border-border bg-surface p-5 shadow-modal ${
          wide ? "max-w-[860px]" : "max-w-[640px]"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border pb-3.5">
          <div>
            <h2 className={`m-0 mb-1 font-bold ${wide ? "mt-2.5 text-2xl leading-tight" : "text-[22px]"}`}>{title}</h2>
            {description ? <p className="m-0 text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted text-base leading-none font-bold text-text"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
