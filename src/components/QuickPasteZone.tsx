import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  ClipboardPaste,
  Combine,
  File as FileIcon,
  FileImage,
  FileText,
  FolderOpen,
  ImageDown,
  Minimize2,
  Scissors,
  Trash2,
  X,
} from "lucide-react";
import type { QueuedFile, ToastTone, WorkspaceView } from "../types";
import { formatFileSize, readFileAsText } from "../utils/fileHelpers";

interface QuickPasteZoneProps {
  queuedFiles: QueuedFile[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  onClearFiles: () => void;
  onRouteToTool: (tool: WorkspaceView, files: File[]) => void;
  onRouteTextToFormatter: (text: string, sourceName: string) => void;
  onNotify: (message: string, tone?: ToastTone) => void;
}

export function QuickPasteZone({
  queuedFiles,
  onAddFiles,
  onRemoveFile,
  onClearFiles,
  onRouteToTool,
  onRouteTextToFormatter,
  onNotify,
}: QuickPasteZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pdfFiles = queuedFiles.filter((q) => q.category === "pdf").map((q) => q.file);
  const imageFiles = queuedFiles.filter((q) => q.category === "image").map((q) => q.file);
  const textFiles = queuedFiles.filter((q) => q.category === "text").map((q) => q.file);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onAddFiles(files);
    }
  };

  const handleSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      onAddFiles(files);
    }
    e.target.value = "";
  };

  const handleClipboardButton = async () => {
    if (!navigator.clipboard || !navigator.clipboard.read) {
      onNotify("Use Ctrl+V (or Cmd+V) to paste copied files directly.", "info");
      return;
    }
    try {
      const clipboardItems = await navigator.clipboard.read();
      const collected: File[] = [];
      let textSnippet = "";

      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith("image/") || type === "application/pdf") {
            const blob = await item.getType(type);
            const ext = type.split("/")[1] || "bin";
            collected.push(
              new File([blob], `clipboard-${Date.now()}.${ext}`, { type })
            );
          } else if (type === "text/plain" && !textSnippet) {
            const blob = await item.getType(type);
            textSnippet = await blob.text();
          }
        }
      }

      if (collected.length > 0) {
        onAddFiles(collected);
      } else if (textSnippet.trim()) {
        const txtFile = new File(
          [textSnippet],
          `clipboard-text-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.txt`,
          { type: "text/plain" }
        );
        onAddFiles([txtFile]);
      } else {
        onNotify("Clipboard is empty or has no supported file/text data.", "warning");
      }
    } catch {
      onNotify("Press Ctrl+V directly anywhere on this page to paste copied files.", "info");
    }
  };

  const handleOpenTextInFormatter = async () => {
    if (textFiles.length === 0) return;
    try {
      const contents = await Promise.all(textFiles.map((f) => readFileAsText(f)));
      const combined = contents.join("\n\n");
      onRouteTextToFormatter(combined, textFiles[0].name);
    } catch {
      onNotify("Could not read the selected text file.", "error");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Quick Paste &amp; Drop Zone</h1>
          <p className="mt-1 text-sm text-slate-600">
            Copy files or screenshots to your clipboard and press{" "}
            <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-xs text-slate-700">
              Ctrl+V
            </kbd>{" "}
            anywhere, or drop files below to route them into any studio tool.
          </p>
        </div>

        {queuedFiles.length > 0 && (
          <button
            type="button"
            onClick={onClearFiles}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear Queue ({queuedFiles.length})</span>
          </button>
        )}
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed bg-white p-10 text-center transition-colors ${
          dragOver
            ? "border-indigo-500 bg-indigo-50/40"
            : "border-slate-300 hover:border-indigo-400"
        }`}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <ClipboardPaste className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-slate-900">
          Drop files here or press Ctrl+V to paste
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Supports PDF documents, JPG/PNG/WebP/GIF images, and TXT/MD/CSV/HTML files.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 whitespace-nowrap"
          >
            <FolderOpen className="h-4 w-4" />
            <span>Browse Files</span>
          </button>
          <button
            type="button"
            onClick={handleClipboardButton}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <ClipboardPaste className="h-4 w-4 text-slate-500" />
            <span>Read Clipboard</span>
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept=".pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.txt,.md,.csv,.html"
          onChange={handleSelect}
        />
      </div>

      {/* Queued Files Grid */}
      {queuedFiles.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-8 text-center">
          <p className="text-sm font-medium text-slate-700">No files staged yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Copied files, screenshots, or dragged documents will appear here with instant tool
            routing options.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {queuedFiles.map((item) => {
              const Icon =
                item.category === "pdf"
                  ? FileText
                  : item.category === "image"
                  ? FileImage
                  : item.category === "text"
                  ? FileText
                  : FileIcon;

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5"
                >
                  {item.previewUrl ? (
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 object-cover bg-slate-50"
                    />
                  ) : (
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                        item.category === "pdf"
                          ? "bg-red-50 text-red-600"
                          : item.category === "text"
                          ? "bg-indigo-50 text-indigo-600"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900">
                      {item.file.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      <span className="uppercase">{item.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {formatFileSize(item.file.size)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveFile(item.id)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 shrink-0"
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Routing Action Bar */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">
                Route staged files to a tool
              </h3>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {pdfFiles.length} PDF · {imageFiles.length} Image · {textFiles.length} Text
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2.5">
              {pdfFiles.length >= 2 && (
                <button
                  type="button"
                  onClick={() => onRouteToTool("merge", pdfFiles)}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-700 whitespace-nowrap"
                >
                  <Combine className="h-3.5 w-3.5" />
                  <span>Merge {pdfFiles.length} PDFs</span>
                </button>
              )}

              {pdfFiles.length >= 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => onRouteToTool("split", [pdfFiles[0]])}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Scissors className="h-3.5 w-3.5 text-slate-500" />
                    <span>Split {pdfFiles[0].name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRouteToTool("compress", [pdfFiles[0]])}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Minimize2 className="h-3.5 w-3.5 text-slate-500" />
                    <span>Compress PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRouteToTool("pdf-to-image", [pdfFiles[0]])}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  >
                    <ImageDown className="h-3.5 w-3.5 text-slate-500" />
                    <span>PDF to Images</span>
                  </button>
                </>
              )}

              {imageFiles.length >= 1 && (
                <button
                  type="button"
                  onClick={() => onRouteToTool("image-to-pdf", imageFiles)}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-700 whitespace-nowrap"
                >
                  <FileImage className="h-3.5 w-3.5" />
                  <span>Convert {imageFiles.length} Image{imageFiles.length > 1 ? "s" : ""} to PDF</span>
                </button>
              )}

              {textFiles.length >= 1 && (
                <button
                  type="button"
                  onClick={handleOpenTextInFormatter}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-700 whitespace-nowrap"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Format Text File{textFiles.length > 1 ? "s" : ""}</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
