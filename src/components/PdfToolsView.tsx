import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Combine,
  Download,
  FileImage,
  FileText,
  FolderOpen,
  ImageDown,
  Loader2,
  Minimize2,
  Scissors,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import type { ToastTone } from "../types";
import { downloadBlob, downloadDataUrl, formatFileSize } from "../utils/fileHelpers";
import {
  compressPdfFile,
  getPdfInfoAndThumbnails,
  imagesToPdf,
  mergePdfFiles,
  renderPdfToImages,
  splitPdfFile,
  type PdfThumbnail,
  type RenderedPageImage,
  type SplitResult,
} from "../utils/pdfEngine";

export type PdfToolId = "merge" | "split" | "compress" | "pdf-to-image" | "image-to-pdf";

interface PdfToolsViewProps {
  tool: PdfToolId;
  initialFiles?: File[];
  onConsumeInitialFiles?: () => void;
  onNotify: (message: string, tone?: ToastTone) => void;
}

const TOOL_META: Record<PdfToolId, { title: string; subtitle: string; accept: string; multiple: boolean }> = {
  merge: {
    title: "Merge PDF",
    subtitle: "Upload two or more PDFs, adjust their sequence, and combine them into one file.",
    accept: ".pdf",
    multiple: true,
  },
  split: {
    title: "Split PDF",
    subtitle: "Preview pages and extract all pages, a continuous range, or custom page numbers.",
    accept: ".pdf",
    multiple: false,
  },
  compress: {
    title: "Compress PDF",
    subtitle: "Optimize PDF streams or recompress page imagery to reduce file size locally.",
    accept: ".pdf",
    multiple: false,
  },
  "pdf-to-image": {
    title: "PDF to Image",
    subtitle: "Render each PDF page into crisp PNG or JPEG images at 1x to 4x resolution.",
    accept: ".pdf",
    multiple: false,
  },
  "image-to-pdf": {
    title: "Image to PDF",
    subtitle: "Arrange JPG, PNG, GIF, or WebP images and package them into a PDF document.",
    accept: "image/*",
    multiple: true,
  },
};

export function PdfToolsView({
  tool,
  initialFiles,
  onConsumeInitialFiles,
  onNotify,
}: PdfToolsViewProps) {
  const meta = TOOL_META[tool];
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Shared processing progress
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");

  // Tool file states
  const [files, setFiles] = useState<File[]>([]);
  const [imageThumbs, setImageThumbs] = useState<Record<string, string>>({});

  // Merge result
  const [mergeResult, setMergeResult] = useState<{ blob: Blob; pageCount: number } | null>(null);

  // Split state
  const [splitThumbnails, setSplitThumbnails] = useState<PdfThumbnail[]>([]);
  const [splitPageCount, setSplitPageCount] = useState(0);
  const [splitMode, setSplitMode] = useState<"all" | "range" | "custom">("all");
  const [splitFrom, setSplitFrom] = useState(1);
  const [splitTo, setSplitTo] = useState(1);
  const [splitCustom, setSplitCustom] = useState("");
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);

  // Compress state
  const [compressMode, setCompressMode] = useState<"balanced" | "strong" | "lossless">("balanced");
  const [compressQuality, setCompressQuality] = useState(72);
  const [compressResult, setCompressResult] = useState<{
    blob: Blob;
    originalSize: number;
    compressedSize: number;
    methodUsed: string;
  } | null>(null);

  // PDF to Image state
  const [p2iFormat, setP2iFormat] = useState<"png" | "jpeg">("png");
  const [p2iScale, setP2iScale] = useState(2);
  const [p2iResults, setP2iResults] = useState<RenderedPageImage[]>([]);

  // Image to PDF state
  const [i2pSize, setI2pSize] = useState<"a4" | "letter" | "fit">("a4");
  const [i2pOrient, setI2pOrient] = useState<"auto" | "portrait" | "landscape">("auto");
  const [i2pMargin, setI2pMargin] = useState(20);
  const [i2pResult, setI2pResult] = useState<{ blob: Blob; pageCount: number } | null>(null);

  // Reset per-tool state when switching tool
  useEffect(() => {
    setFiles([]);
    setMergeResult(null);
    setSplitThumbnails([]);
    setSplitPageCount(0);
    setSelectedPages([]);
    setSplitResult(null);
    setCompressResult(null);
    setP2iResults([]);
    setI2pResult(null);
    setProgress(0);
    setProgressLabel("");
  }, [tool]);

  // Accept initial files routed from Quick Paste
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      void ingestFiles(initialFiles);
      onConsumeInitialFiles?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiles]);

  // Create object URLs for image-to-pdf previews
  useEffect(() => {
    if (tool !== "image-to-pdf") return;
    const urls: Record<string, string> = {};
    files.forEach((f, idx) => {
      urls[`${f.name}-${f.size}-${idx}`] = URL.createObjectURL(f);
    });
    setImageThumbs(urls);
    return () => {
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [files, tool]);

  const ingestFiles = async (incoming: File[]) => {
    const valid = incoming.filter((f) =>
      tool === "image-to-pdf"
        ? f.type.startsWith("image/") || /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(f.name)
        : f.type === "application/pdf" || /\.pdf$/i.test(f.name)
    );

    if (valid.length === 0) {
      onNotify(
        tool === "image-to-pdf"
          ? "Please select valid image files (JPG, PNG, WebP, GIF)."
          : "Please select a valid PDF file.",
        "warning"
      );
      return;
    }

    if (meta.multiple) {
      setFiles((prev) => [...prev, ...valid]);
      setMergeResult(null);
      setI2pResult(null);
      onNotify(`Added ${valid.length} file${valid.length > 1 ? "s" : ""}.`, "success");
    } else {
      const picked = valid[0];
      setFiles([picked]);
      setSplitResult(null);
      setCompressResult(null);
      setP2iResults([]);

      if (tool === "split") {
        setBusy(true);
        setProgress(0);
        setProgressLabel("Loading PDF pages...");
        try {
          const info = await getPdfInfoAndThumbnails(picked, 24, (pct, lbl) => {
            setProgress(pct);
            if (lbl) setProgressLabel(lbl);
          });
          setSplitPageCount(info.pageCount);
          setSplitThumbnails(info.thumbnails);
          setSplitFrom(1);
          setSplitTo(info.pageCount);
          setSelectedPages([]);
          setSplitCustom("");
          onNotify(`Loaded PDF (${info.pageCount} pages).`, "success");
        } catch (err: unknown) {
          onNotify(err instanceof Error ? err.message : "Could not load PDF.", "error");
        } finally {
          setBusy(false);
        }
      } else {
        onNotify(`Loaded ${picked.name}.`, "success");
      }
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) void ingestFiles(dropped);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    if (picked.length > 0) void ingestFiles(picked);
    e.target.value = "";
  };

  const moveFile = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= files.length) return;
    setFiles((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
    setMergeResult(null);
    setI2pResult(null);
  };

  const removeFileAt = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setMergeResult(null);
    setI2pResult(null);
  };

  const toggleSplitPage = (pageNumber: number) => {
    setSplitMode("custom");
    setSelectedPages((prev) => {
      const next = prev.includes(pageNumber)
        ? prev.filter((p) => p !== pageNumber)
        : [...prev, pageNumber].sort((a, b) => a - b);
      setSplitCustom(next.join(", "));
      return next;
    });
  };

  const runMerge = async () => {
    if (files.length < 2) {
      onNotify("Add at least 2 PDF files to merge.", "warning");
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const res = await mergePdfFiles(files, (pct, lbl) => {
        setProgress(pct);
        if (lbl) setProgressLabel(lbl);
      });
      setMergeResult(res);
      onNotify(`Merged ${files.length} PDFs (${res.pageCount} pages).`, "success");
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : "Merge failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const runSplit = async () => {
    if (!files[0]) return;
    setBusy(true);
    setProgress(0);
    try {
      const res = await splitPdfFile(
        files[0],
        splitMode,
        { from: splitFrom, to: splitTo, custom: splitCustom },
        (pct, lbl) => {
          setProgress(pct);
          if (lbl) setProgressLabel(lbl);
        }
      );
      setSplitResult(res);
      if (res.kind === "single") {
        onNotify(`Extracted ${res.pageCount} page(s).`, "success");
      } else {
        onNotify(`Prepared ${res.files.length} individual PDF pages.`, "success");
      }
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : "Split failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const runCompress = async () => {
    if (!files[0]) return;
    setBusy(true);
    setProgress(0);
    try {
      const res = await compressPdfFile(files[0], compressMode, compressQuality, (pct, lbl) => {
        setProgress(pct);
        if (lbl) setProgressLabel(lbl);
      });
      setCompressResult(res);
      onNotify("Compression complete.", "success");
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : "Compression failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const runPdfToImage = async () => {
    if (!files[0]) return;
    setBusy(true);
    setProgress(0);
    try {
      const imgs = await renderPdfToImages(files[0], p2iFormat, p2iScale, (pct, lbl) => {
        setProgress(pct);
        if (lbl) setProgressLabel(lbl);
      });
      setP2iResults(imgs);
      onNotify(`Converted ${imgs.length} pages to ${p2iFormat.toUpperCase()}.`, "success");
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : "Conversion failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const runImageToPdf = async () => {
    if (files.length === 0) return;
    setBusy(true);
    setProgress(0);
    try {
      const res = await imagesToPdf(
        files,
        { pageSize: i2pSize, orientation: i2pOrient, margin: i2pMargin },
        (pct, lbl) => {
          setProgress(pct);
          if (lbl) setProgressLabel(lbl);
        }
      );
      setI2pResult(res);
      onNotify(`Created ${res.pageCount}-page PDF from images.`, "success");
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : "Image conversion failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const ToolIcon =
    tool === "merge"
      ? Combine
      : tool === "split"
      ? Scissors
      : tool === "compress"
      ? Minimize2
      : tool === "pdf-to-image"
      ? ImageDown
      : FileImage;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{meta.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{meta.subtitle}</p>
        </div>

        {files.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setFiles([]);
              setMergeResult(null);
              setSplitResult(null);
              setSplitThumbnails([]);
              setCompressResult(null);
              setP2iResults([]);
              setI2pResult(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-red-600 whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Upload / Drop Box */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`cursor-pointer rounded-xl border-2 border-dashed bg-white p-8 text-center transition-colors ${
          dragOver
            ? "border-indigo-500 bg-indigo-50/40"
            : "border-slate-300 hover:border-indigo-400"
        }`}
      >
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-indigo-600">
          {files.length === 0 ? <UploadCloud className="h-5 w-5" /> : <ToolIcon className="h-5 w-5" />}
        </div>
        <div className="mt-3 text-sm font-semibold text-slate-900">
          {meta.multiple
            ? files.length > 0
              ? "Add more files to queue"
              : `Select or drop ${tool === "image-to-pdf" ? "images" : "PDF files"}`
            : files.length > 0
            ? `Replace ${files[0].name}`
            : "Select or drop a PDF file"}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Click to browse, drag &amp; drop, or paste anywhere with Ctrl+V.
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-700 whitespace-nowrap"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <span>Choose {meta.multiple ? "Files" : "File"}</span>
        </button>

        <input
          ref={inputRef}
          type="file"
          multiple={meta.multiple}
          accept={meta.accept}
          hidden
          onChange={handleFileChange}
        />
      </div>

      {/* Progress Bar */}
      {busy && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-700">
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
              {progressLabel || "Processing..."}
            </span>
            <span className="font-mono tabular-nums">{progress}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Multi-file ordered queue (Merge & Image-to-PDF) */}
      {meta.multiple && files.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700">
            <span>File Order ({files.length})</span>
            <span className="font-normal text-slate-500">Use arrows to reorder sequence</span>
          </div>
          <div className="divide-y divide-slate-100">
            {files.map((f, idx) => {
              const thumb = imageThumbs[`${f.name}-${f.size}-${idx}`];
              return (
                <div key={`${f.name}-${idx}`} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-5 font-mono text-xs text-slate-400 tabular-nums">
                    {idx + 1}.
                  </span>
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={f.name}
                      className="h-9 w-9 shrink-0 rounded border border-slate-200 object-cover"
                    />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-red-500" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                    {f.name}
                  </span>
                  <span className="font-mono text-xs text-slate-500 tabular-nums shrink-0">
                    {formatFileSize(f.size)}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveFile(idx, -1)}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === files.length - 1}
                      onClick={() => moveFile(idx, 1)}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFileAt(idx)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Single-file metadata pill-free strip */}
      {!meta.multiple && files[0] && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="h-4 w-4 shrink-0 text-red-600" />
            <span className="truncate font-medium text-slate-900">{files[0].name}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 font-mono tabular-nums shrink-0">
            <span>{formatFileSize(files[0].size)}</span>
            {tool === "split" && splitPageCount > 0 && <span>{splitPageCount} pages</span>}
          </div>
        </div>
      )}

      {/* MERGE ACTION & RESULT */}
      {tool === "merge" && files.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy || files.length < 2}
              onClick={runMerge}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Combine className="h-4 w-4" />
              <span>Merge {files.length} PDFs</span>
            </button>
          </div>

          {mergeResult && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Merged PDF ready for download
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-slate-600 tabular-nums">
                    {mergeResult.pageCount} total pages · {formatFileSize(mergeResult.blob.size)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => downloadBlob(mergeResult.blob, "merged.pdf")}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 whitespace-nowrap"
              >
                <Download className="h-4 w-4" />
                <span>Download merged.pdf</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* SPLIT OPTIONS, PREVIEW & RESULT */}
      {tool === "split" && files[0] && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Split Mode
                </label>
                <select
                  value={splitMode}
                  onChange={(e) =>
                    setSplitMode(e.target.value as "all" | "range" | "custom")
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="all">All pages (one PDF per page)</option>
                  <option value="range">Page range</option>
                  <option value="custom">Custom pages (e.g. 1, 3, 5-8)</option>
                </select>
              </div>

              {splitMode === "range" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      From Page
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, splitPageCount)}
                      value={splitFrom}
                      onChange={(e) => setSplitFrom(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      To Page
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, splitPageCount)}
                      value={splitTo}
                      onChange={(e) => setSplitTo(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </>
              )}

              {splitMode === "custom" && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Selected Pages (click thumbnails below or type ranges)
                  </label>
                  <input
                    type="text"
                    value={splitCustom}
                    onChange={(e) => setSplitCustom(e.target.value)}
                    placeholder="1, 3, 5-8"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={runSplit}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Scissors className="h-4 w-4" />
                <span>Split PDF</span>
              </button>
            </div>
          </div>

          {splitThumbnails.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-600">
                Page Previews (click any page to toggle selection)
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {splitThumbnails.map((thumb) => {
                  const active = selectedPages.includes(thumb.pageNumber);
                  return (
                    <button
                      key={thumb.pageNumber}
                      type="button"
                      onClick={() => toggleSplitPage(thumb.pageNumber)}
                      className={`overflow-hidden rounded-lg border bg-white text-left transition-colors ${
                        active
                          ? "border-indigo-600 ring-2 ring-indigo-500/30"
                          : "border-slate-200 hover:border-indigo-300"
                      }`}
                    >
                      <img
                        src={thumb.dataUrl}
                        alt={`Page ${thumb.pageNumber}`}
                        className="h-36 w-full object-contain bg-slate-50"
                      />
                      <div
                        className={`border-t px-2 py-1.5 text-center font-mono text-xs tabular-nums ${
                          active
                            ? "border-indigo-200 bg-indigo-50 font-semibold text-indigo-700"
                            : "border-slate-100 text-slate-600"
                        }`}
                      >
                        Page {thumb.pageNumber}
                      </div>
                    </button>
                  );
                })}
              </div>
              {splitPageCount > splitThumbnails.length && (
                <p className="text-xs text-slate-500">
                  Showing first {splitThumbnails.length} of {splitPageCount} pages in preview.
                </p>
              )}
            </div>
          )}

          {splitResult && splitResult.kind === "single" && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Extracted {splitResult.pageCount} page{splitResult.pageCount > 1 ? "s" : ""}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-slate-600 tabular-nums">
                    {splitResult.filename} · {formatFileSize(splitResult.blob.size)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => downloadBlob(splitResult.blob, splitResult.filename)}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <Download className="h-4 w-4" />
                <span>Download PDF</span>
              </button>
            </div>
          )}

          {splitResult && splitResult.kind === "multiple" && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">
                  Extracted {splitResult.files.length} PDF files
                </div>
                <button
                  type="button"
                  onClick={() => {
                    splitResult.files.forEach((f, idx) => {
                      setTimeout(() => downloadBlob(f.blob, f.filename), idx * 140);
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download All ({splitResult.files.length})</span>
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {splitResult.files.map((item) => (
                  <button
                    key={item.pageNumber}
                    type="button"
                    onClick={() => downloadBlob(item.blob, item.filename)}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40"
                  >
                    <span className="truncate font-mono">{item.filename}</span>
                    <Download className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* COMPRESS OPTIONS & RESULT */}
      {tool === "compress" && files[0] && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Compression Strategy
                </label>
                <select
                  value={compressMode}
                  onChange={(e) =>
                    setCompressMode(e.target.value as "balanced" | "strong" | "lossless")
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="balanced">Balanced (recompress heavy pages + optimize)</option>
                  <option value="strong">Strong (maximum size reduction)</option>
                  <option value="lossless">Lossless (strip metadata + object streams)</option>
                </select>
              </div>

              {compressMode !== "lossless" && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Image Quality:{" "}
                    <span className="font-mono text-indigo-600 tabular-nums">
                      {compressQuality}%
                    </span>
                  </label>
                  <input
                    type="range"
                    min={20}
                    max={95}
                    value={compressQuality}
                    onChange={(e) => setCompressQuality(Number(e.target.value))}
                    className="mt-2 w-full accent-indigo-600"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={runCompress}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Minimize2 className="h-4 w-4" />
                <span>Compress PDF</span>
              </button>
            </div>
          </div>

          {compressResult && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {compressResult.methodUsed}
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-600 tabular-nums">
                    {formatFileSize(compressResult.originalSize)} →{" "}
                    {formatFileSize(compressResult.compressedSize)} (
                    {Math.max(
                      0,
                      Math.round(
                        ((compressResult.originalSize - compressResult.compressedSize) /
                          compressResult.originalSize) *
                          1000
                      ) / 10
                    )}
                    % reduced)
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => downloadBlob(compressResult.blob, `compressed_${files[0].name}`)}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <Download className="h-4 w-4" />
                <span>Download Compressed PDF</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* PDF TO IMAGE OPTIONS & RESULTS */}
      {tool === "pdf-to-image" && files[0] && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Image Format
                </label>
                <select
                  value={p2iFormat}
                  onChange={(e) => setP2iFormat(e.target.value as "png" | "jpeg")}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="png">PNG (lossless)</option>
                  <option value="jpeg">JPEG (smaller size)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Render Scale:{" "}
                  <span className="font-mono text-indigo-600 tabular-nums">{p2iScale}x</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.5}
                  value={p2iScale}
                  onChange={(e) => setP2iScale(Number(e.target.value))}
                  className="mt-2 w-full accent-indigo-600"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={runPdfToImage}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <ImageDown className="h-4 w-4" />
                <span>Convert to Images</span>
              </button>
            </div>
          </div>

          {p2iResults.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">
                  Rendered Pages ({p2iResults.length})
                </div>
                <button
                  type="button"
                  onClick={() => {
                    p2iResults.forEach((img, idx) => {
                      setTimeout(() => downloadDataUrl(img.dataUrl, img.filename), idx * 140);
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download All Images</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {p2iResults.map((img) => (
                  <div
                    key={img.pageNumber}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    <img
                      src={img.dataUrl}
                      alt={`Page ${img.pageNumber}`}
                      className="h-44 w-full object-contain bg-slate-50"
                    />
                    <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs">
                      <div className="font-mono text-slate-600 tabular-nums">
                        P.{img.pageNumber} · {img.width}×{img.height}
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadDataUrl(img.dataUrl, img.filename)}
                        className="rounded p-1 text-indigo-600 hover:bg-indigo-50"
                        aria-label={`Download page ${img.pageNumber}`}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* IMAGE TO PDF OPTIONS & RESULT */}
      {tool === "image-to-pdf" && files.length > 0 && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Page Size
                </label>
                <select
                  value={i2pSize}
                  onChange={(e) => setI2pSize(e.target.value as "a4" | "letter" | "fit")}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="a4">A4</option>
                  <option value="letter">Letter</option>
                  <option value="fit">Fit to Image</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Orientation
                </label>
                <select
                  value={i2pOrient}
                  onChange={(e) =>
                    setI2pOrient(e.target.value as "auto" | "portrait" | "landscape")
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="auto">Auto (per image)</option>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Page Margin
                </label>
                <select
                  value={i2pMargin}
                  onChange={(e) => setI2pMargin(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                >
                  <option value={0}>No margin (0 pt)</option>
                  <option value={20}>Small (20 pt)</option>
                  <option value={40}>Medium (40 pt)</option>
                  <option value={60}>Large (60 pt)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={runImageToPdf}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <FileImage className="h-4 w-4" />
                <span>Create PDF ({files.length} image{files.length > 1 ? "s" : ""})</span>
              </button>
            </div>
          </div>

          {i2pResult && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    PDF generated from {i2pResult.pageCount} image{i2pResult.pageCount > 1 ? "s" : ""}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-slate-600 tabular-nums">
                    images.pdf · {formatFileSize(i2pResult.blob.size)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => downloadBlob(i2pResult.blob, "images.pdf")}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <Download className="h-4 w-4" />
                <span>Download images.pdf</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
