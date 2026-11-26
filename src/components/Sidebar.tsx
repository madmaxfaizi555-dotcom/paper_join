import {
  ClipboardPaste,
  Combine,
  FileImage,
  FileText,
  Home,
  ImageDown,
  Minimize2,
  Scissors,
  X,
} from "lucide-react";
import type { WorkspaceView } from "../types";

interface SidebarProps {
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  pastedCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavGroup {
  label: string;
  items: {
    id: WorkspaceView;
    label: string;
    icon: typeof Home;
  }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { id: "overview", label: "Overview", icon: Home },
      { id: "paste-zone", label: "Quick Paste", icon: ClipboardPaste },
    ],
  },
  {
    label: "PDF Operations",
    items: [
      { id: "merge", label: "Merge PDF", icon: Combine },
      { id: "split", label: "Split PDF", icon: Scissors },
      { id: "compress", label: "Compress PDF", icon: Minimize2 },
    ],
  },
  {
    label: "Convert & Text",
    items: [
      { id: "pdf-to-image", label: "PDF to Image", icon: ImageDown },
      { id: "image-to-pdf", label: "Image to PDF", icon: FileImage },
      { id: "text-formatter", label: "Text Formatter", icon: FileText },
    ],
  },
];

export function Sidebar({
  activeView,
  onSelectView,
  pastedCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const handlePick = (view: WorkspaceView) => {
    onSelectView(view);
    onCloseMobile();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-150 lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-5">
          <button
            type="button"
            onClick={() => handlePick("overview")}
            className="flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white">
              <FileText className="h-4 w-4" />
            </span>
            <span className="font-display text-sm font-semibold tracking-tight text-slate-900 whitespace-nowrap">
              PaperJoin Studio
            </span>
          </button>

          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="Workspace navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-1.5 text-xs font-medium text-slate-400">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handlePick(item.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                        isActive
                          ? "bg-indigo-50 text-indigo-700"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            isActive ? "text-indigo-600" : "text-slate-400"
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.id === "paste-zone" && pastedCount > 0 && (
                        <span className="font-mono text-xs tabular-nums text-indigo-600">
                          {pastedCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-200 px-5 py-3.5 text-xs text-slate-500">
          <div className="font-medium text-slate-700">Local-first processing</div>
          <div className="mt-0.5 leading-relaxed">
            PDFs stay in your browser. Press Ctrl+V anywhere to queue files.
          </div>
        </div>
      </aside>
    </>
  );
}
