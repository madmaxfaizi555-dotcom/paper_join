import { ClipboardPaste, FileText, Menu, X } from "lucide-react";
import { useState } from "react";
import type { WorkspaceView } from "../types";

interface TopBarProps {
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  onReadClipboard: () => void;
}

const NAV_ITEMS: { id: WorkspaceView; label: string }[] = [
  { id: "studio", label: "Merge & Create" },
  { id: "split", label: "Split PDF" },
  { id: "compress", label: "Compress PDF" },
  { id: "pdf-to-image", label: "PDF to Image" },
  { id: "text-formatter", label: "Text Formatter" },
];

export function TopBar({
  activeView,
  onSelectView,
  onReadClipboard,
}: TopBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSelect = (view: WorkspaceView) => {
    onSelectView(view);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-[#E4E8DF] bg-[#F8F9F5]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1160px] items-center justify-between gap-8 px-4 sm:px-6">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleSelect("studio")}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#226847] rounded-md"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#226847] text-white">
            <FileText className="h-4 w-4" />
          </span>
          <span className="font-display text-base font-semibold tracking-tight text-[#1D2B22] whitespace-nowrap">
            PaperJoin Studio
          </span>
        </button>

        {/* Zone 2: Clean single-line nav links */}
        <nav
          className="hidden items-center gap-6 md:flex"
          aria-label="Primary navigation"
        >
          {NAV_ITEMS.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#226847] rounded ${
                  active
                    ? "text-[#226847]"
                    : "text-[#5C6B60] hover:text-[#1D2B22]"
                }`}
              >
                {item.label}
                {active && (
                  <span
                    className="absolute inset-x-0 -bottom-[21px] h-[2px] bg-[#226847]"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onReadClipboard}
            className="inline-flex items-center gap-2 rounded-lg bg-[#226847] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#1B553A] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#226847]"
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
            <span>Paste Files</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-lg border border-[#E4E8DF] bg-white p-2 text-[#1D2B22] md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav Drawer */}
      {mobileOpen && (
        <div className="border-t border-[#E4E8DF] bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`rounded-lg px-3 py-2 text-left text-sm font-medium ${
                    active
                      ? "bg-[#EEF4EA] text-[#226847]"
                      : "text-[#5C6B60] hover:bg-[#F2F6EE] hover:text-[#1D2B22]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
