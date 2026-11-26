import { ClipboardPaste, Menu } from "lucide-react";
import type { WorkspaceView } from "../types";

interface TopBarProps {
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  onOpenMobileMenu: () => void;
  pastedCount: number;
}

const VIEW_TITLES: Record<WorkspaceView, string> = {
  overview: "Workspace Overview",
  "paste-zone": "Quick Paste & Drop Zone",
  "text-formatter": "Raw Text Formatter",
  merge: "Merge PDF",
  split: "Split PDF",
  compress: "Compress PDF",
  "pdf-to-image": "PDF to Image",
  "image-to-pdf": "Image to PDF",
};

export function TopBar({
  activeView,
  onSelectView,
  onOpenMobileMenu,
  pastedCount,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="flex min-w-0 items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => onSelectView("overview")}
            className="hidden text-slate-500 hover:text-slate-900 sm:inline whitespace-nowrap shrink-0"
          >
            Workspace
          </button>
          <span className="hidden text-slate-300 sm:inline" aria-hidden="true">
            /
          </span>
          <span className="truncate font-medium text-slate-900">
            {VIEW_TITLES[activeView]}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <span className="hidden text-xs text-slate-500 md:inline whitespace-nowrap">
          Press <kbd className="font-mono text-slate-700">Ctrl+V</kbd> anywhere to paste files
        </span>

        <button
          type="button"
          onClick={() =>
            onSelectView(activeView === "paste-zone" ? "text-formatter" : "paste-zone")
          }
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
          <span>
            {activeView === "paste-zone"
              ? "Text Formatter"
              : pastedCount > 0
              ? `Quick Paste (${pastedCount})`
              : "Quick Paste"}
          </span>
        </button>
      </div>
    </header>
  );
}
