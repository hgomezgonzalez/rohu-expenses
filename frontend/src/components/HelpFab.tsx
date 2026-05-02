"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { HelpCircle, X } from "lucide-react";
import { getHelpFor } from "@/help/content";

function renderBody(line: string, idx: number) {
  if (line.startsWith("- ")) {
    return (
      <li key={idx} className="ml-4 list-disc text-rohu-muted">
        {line.slice(2)}
      </li>
    );
  }
  return (
    <p key={idx} className="text-rohu-muted leading-relaxed">
      {line}
    </p>
  );
}

export default function HelpFab() {
  const pathname = usePathname() || "/dashboard";
  const [open, setOpen] = useState(false);
  const entry = getHelpFor(pathname);

  // close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Ayuda de esta pantalla"
        onClick={() => setOpen(true)}
        className="fixed z-40 bottom-24 right-4 md:bottom-6 md:right-6 w-12 h-12 rounded-full bg-rohu-accent text-white shadow-lg hover:bg-rohu-accent/90 flex items-center justify-center transition-colors"
      >
        <HelpCircle className="w-6 h-6" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center md:justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-rohu-border px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-rohu-accent" />
                <h2 className="font-semibold text-rohu-primary">{entry.title}</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar ayuda"
                className="p-2 -mr-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 text-sm">
              <p className="text-rohu-primary font-medium">{entry.intro}</p>

              {entry.sections.map((section, i) => (
                <section key={i} className="space-y-1">
                  <h3 className="font-semibold text-rohu-primary mt-2">{section.title}</h3>
                  <ul className="space-y-1">{section.body.map(renderBody)}</ul>
                </section>
              ))}

              {entry.tip && (
                <div className="mt-4 p-3 bg-rohu-accent/10 border-l-4 border-rohu-accent rounded text-sm">
                  <strong className="text-rohu-primary">Tip:</strong>{" "}
                  <span className="text-rohu-muted">{entry.tip}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
