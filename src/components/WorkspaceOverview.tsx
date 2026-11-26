import { useState, type DragEvent } from "react";
import {
  ArrowRight,
  ClipboardPaste,
  Combine,
  FileImage,
  FileText,
  ImageDown,
  Minimize2,
  Scissors,
  UploadCloud,
} from "lucide-react";
import type { WorkspaceView } from "../types";

interface WorkspaceOverviewProps {
  onSelectView: (view: WorkspaceView) => void;
  onDropFiles: (files: File[]) => void;
}

interface ToolItem {
  id: WorkspaceView;
  title: string;
  description: string;
  category: string;
  icon: typeof Combine;
}

const TOOLS: ToolItem[] = [
  {
    id: "merge",
    title: "Merge PDF",
    description: "Combine multiple PDF documents in your preferred page order.",
    category: "PDF Operations",
    icon: Combine,
  },
  {
    id: "split",
    title: "Split PDF",
    description: "Inspect page thumbnails and extract specific ranges or single pages.",
    category: "PDF Operations",
    icon: Scissors,
  },
  {
    id: "compress",
    title: "Compress PDF",
    description: "Shrink PDF file sizes with lossless optimization or page recompression.",
    category: "PDF Operations",
    icon: Minimize2,
  },
  {
    id: "pdf-to-image",
    title: "PDF to Image",
    description: "Render every PDF page as crisp PNG or JPEG images up to 4x scale.",
    category: "Converters",
    icon: ImageDown,
  },
  {
    id: "image-to-pdf",
    title: "Image to PDF",
    description: "Assemble JPG, PNG, and WebP images into A4, Letter, or fitted PDFs.",
    category: "Converters",
    icon: FileImage,
  },
  {
    id: "text-formatter",
    title: "Raw Text Formatter",
    description: "Clean spacing, fix punctuation, apply presets, or format with AI.",
    category: "Text Workspace",
    icon: FileText,
  },
];

export function WorkspaceOverview({
  onSelectView,
  onDropFiles,
}: WorkspaceOverviewProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onDropFiles(files);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Workspace Header & Quick Drop Banner */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7 space-y-3">
            <div className="text-xs font-medium text-slate-500">
              Browser-local PDF tools · Global clipboard paste · Hybrid text formatter
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Clean PDF &amp; Text Workspace
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-slate-600 sm:text-base">
              Merge, split, compress, and convert documents directly on your device, paste copied
              files with Ctrl+V from anywhere, or structure raw text into ready-to-export documents.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onSelectView("paste-zone")}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
              >
                <ClipboardPaste className="h-4 w-4" />
                <span>Open Quick Paste Zone</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectView("text-formatter")}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap"
              >
                <FileText className="h-4 w-4 text-slate-500" />
                <span>Open Text Formatter</span>
              </button>
            </div>
          </div>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => onSelectView("paste-zone")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectView("paste-zone");
              }
            }}
            className={`lg:col-span-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              dragOver
                ? "border-indigo-500 bg-indigo-50/60"
                : "border-slate-200 bg-slate-50/70 hover:border-indigo-300 hover:bg-slate-50"
            }`}
          >
            <UploadCloud className="h-8 w-8 text-indigo-600" />
            <div className="mt-3 text-sm font-semibold text-slate-900">
              Drop files or press Ctrl+V
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Accepts PDF, PNG, JPG, WebP, and TXT files to route into any tool.
            </p>
          </div>
        </div>
      </section>

      {/* Tool Grid */}
      <section aria-labelledby="workspace-tools-heading">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 id="workspace-tools-heading" className="text-lg font-semibold text-slate-900">
            Studio Tools
          </h2>
          <span className="text-xs text-slate-500 tabular-nums">6 core utilities</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onSelectView(tool.id)}
                className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-xs text-slate-400">{tool.category}</span>
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">
                    {tool.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    {tool.description}
                  </p>
                </div>

                <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600">
                  <span>Open tool</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Workspace Architecture Notes */}
      <section className="grid gap-6 border-t border-slate-200 pt-6 sm:grid-cols-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Local PDF Processing</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Merging, splitting, compression, and image rendering execute locally in your browser
            memory without uploading documents.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Global Clipboard Workflow</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Copy files or screenshots to your clipboard and press Ctrl+V anywhere in the workspace
            to stage and route them in one click.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Hybrid Text Formatter</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Run instant deterministic cleanup presets offline, or use AI Smart Format for messy
            unpunctuated transcripts and notes.
          </p>
        </div>
      </section>
    </div>
  );
}
