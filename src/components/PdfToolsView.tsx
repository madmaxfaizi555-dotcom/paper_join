import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  CheckCircle2,
  Download,
  FileText,
  ImageDown,
  Loader2,
  Minimize2,
  Plus,
  Scissors,
  Trash2,
  Upload,
} from "lucide-react";
import type { ToastTone } from "../types";
import { downloadBlob, downloadDataUrl, formatFileSize } from "../utils/fileHelpers";
import {
  compressPdfFile,
  getPdfInfoAndThumbnails,
  renderPdfToImages,
  splitPdfFile,
  type PdfThumbnail,
  type RenderedPageImage,
  type SplitResult,
} from "../utils/pdfEngine";

export type PdfUtilityId = "split" | "compress" | "pdf-to-image";

interface PdfToolsViewProps {
  tool: PdfUtilityId;
  initialFile?: File;
  onConsumeInitialFile?: () => void;
  onNotify: (message: string, tone?: ToastTone) => void;
}

const TOOL_META: Record<
  PdfUtilityId,
  { title: string; kicker: string; subtitle: string }
> = {
  split: {
    kicker: "EXTRACT & REORGANIZE",
    title: "Split PDF",
    subtitle:
      "Inspect page thumbnails and extract individual pages, a range, or custom selections.",
  },
  compress: {
    kicker: "SIZE OPTIMIZATION",
    title: "Compress PDF",
    subtitle:
      "Optimize PDF streams or recompress heavy pages locally without leaving your browser.",
  },
  "pdf-to-image": {
    kicker: "PAGE RENDERING",
    title: "PDF to Image",
    subtitle:
      "Render each PDF page into crisp PNG or JPEG images up to 4x resolution.",
  },
};

export function PdfToolsView({
  tool,
  initialFile,
  onConsumeInitialFile,
  onNotify,
}: PdfToolsViewProps) {
  const meta = TOOL_META[tool];
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");

  const [file, setFile] = useState<File | null>(null);

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
  const [compressMode, setCompressMode] = useState<
    "balanced" | "strong" | "lossless"
  >("balanced");
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

  useEffect(() => {
    setFile(null);
    setSplitThumbnails([]);
    setSplitPageCount(0);
    setSelectedPages([]);
    setSplitResult(null);
    setCompressResult(null);
    setP2iResults([]);
    setProgress(0);
    setProgressLabel("");
  }, [tool]);

  useEffect(() => {
    if (initialFile) {
      void loadPdfFile(initialFile);
      onConsumeInitialFile?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  const loadPdfFile = async (picked: File) => {
    if (picked.type !== "application/pdf" && !/\.pdf$/i.test(picked.name)) {
      onNotify("Please select a valid PDF file.", "warning");
      return;
    }

    setFile(picked);
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
        onNotify(`Loaded ${picked.name} (${info.pageCount} pages).`, "success");
      } catch (err: unknown) {
        onNotify(
          err instanceof Error ? err.message : "Could not load PDF.",
          "error"
        );
      } finally {
        setBusy(false);
      }
    } else {
      onNotify(`Loaded ${picked.name}.`, "success");
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped[0]) void loadPdfFile(dropped[0]);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) void loadPdfFile(picked);
    e.target.value = "";
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

  const runSplit = async () => {
    if (!file) return;
    setBusy(true);
    setProgress(0);
    try {
      const res = await splitPdfFile(
        file,
        splitMode,
        { from: splitFrom, to: splitTo, custom: splitCustom },
        (pct, lbl) => {
          setProgress(pct);
          if (lbl) setProgressLabel(lbl);
        }
      );
      setSplitResult(res);
      onNotify(
        res.kind === "single"
          ? `Extracted ${res.pageCount} page(s).`
          : `Prepared ${res.files.length} individual PDF pages.`,
        "success"
      );
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : "Split failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const runCompress = async () => {
    if (!file) return;
    setBusy(true);
    setProgress(0);
    try {
      const res = await compressPdfFile(
        file,
        compressMode,
        compressQuality,
        (pct, lbl) => {
          setProgress(pct);
          if (lbl) setProgressLabel(lbl);
        }
      );
      setCompressResult(res);
      onNotify("Compression complete.", "success");
    } catch (err: unknown) {
      onNotify(
        err instanceof Error ? err.message : "Compression failed.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  const runPdfToImage = async () => {
    if (!file) return;
    setBusy(true);
    setProgress(0);
    try {
      const imgs = await renderPdfToImages(
        file,
        p2iFormat,
        p2iScale,
        (pct, lbl) => {
          setProgress(pct);
          if (lbl) setProgressLabel(lbl);
        }
      );
      setP2iResults(imgs);
      onNotify(
        `Converted ${imgs.length} pages to ${p2iFormat.toUpperCase()}.`,
        "success"
      );
    } catch (err: unknown) {
      onNotify(
        err instanceof Error ? err.message : "Conversion failed.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1160px] space-y-6 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5E6E63]">
            {meta.kicker}
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold text-[#1D2B22] sm:text-3xl">
            {meta.title}
          </h1>
          <p className="mt-1 text-sm text-[#637267]">{meta.subtitle}</p>
        </div>

        {file && (
          <button
            type="button"
            onClick={() => {
              setFile(null);
              setSplitThumbnails([]);
              setSplitResult(null);
              setCompressResult(null);
              setP2iResults([]);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E8DF] bg-white px-3 py-2 text-xs font-medium text-[#5C6B60] hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear file</span>
          </button>
        )}
      </div>

      {/* Main Card */}
      <div className="rounded-[20px] border border-[#E4E8DF] bg-white p-6 shadow-[0_8px_30px_rgba(24,39,28,0.04)] sm:p-8 space-y-6">
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
          className={`cursor-pointer rounded-xl border-[1.5px] border-dashed px-6 py-8 text-center transition-colors ${
            dragOver
              ? "border-[#226847] bg-[#E8F0E2]"
              : "border-[#BDD0BE] bg-[#F2F6EE] hover:border-[#7FA585]"
          }`}
        >
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-[#DCE4D7] bg-white text-[#226847]">
            <Upload className="h-4 w-4" />
          </div>
          <div className="mt-3 text-[15px] font-semibold text-[#1D2B22]">
            {file ? `Replace ${file.name}` : "Drop a PDF file here"}
          </div>
          <p className="mt-1 text-xs text-[#637267]">
            Click to browse, drag &amp; drop, or paste with Ctrl+V.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#26322A] px-4 py-2 text-xs font-medium text-white hover:bg-[#19231D]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Choose PDF</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            hidden
            onChange={handleFileChange}
          />
        </div>

        {file && (
          <div className="flex items-center justify-between rounded-xl border border-[#EAEDE6] bg-[#FAFBF8] px-4 py-3 text-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F7EBE8] font-mono text-[10px] font-semibold text-[#B86B5E]">
                PDF
              </div>
              <span className="truncate font-medium text-[#1D2B22]">
                {file.name}
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs text-[#6B786D] tabular-nums shrink-0">
              <span>{formatFileSize(file.size)}</span>
              {tool === "split" && splitPageCount > 0 && (
                <span>{splitPageCount} pages</span>
              )}
            </div>
          </div>
        )}

        {busy && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[#425046]">
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#226847]" />
                {progressLabel || "Processing..."}
              </span>
              <span className="font-mono tabular-nums">{progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EEF2EA]">
              <div
                className="h-full rounded-full bg-[#226847] transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* SPLIT */}
        {tool === "split" && file && (
          <div className="space-y-5 border-t border-[#EAEDE6] pt-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#425046]">
                  Split Mode
                </label>
                <select
                  value={splitMode}
                  onChange={(e) =>
                    setSplitMode(e.target.value as "all" | "range" | "custom")
                  }
                  className="w-full rounded-lg border border-[#DDE3D8] bg-white px-3 py-2 text-sm text-[#1D2B22] focus:border-[#226847] focus:outline-none"
                >
                  <option value="all">All pages (one PDF per page)</option>
                  <option value="range">Page range</option>
                  <option value="custom">Custom pages (e.g. 1, 3, 5-8)</option>
                </select>
              </div>

              {splitMode === "range" && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[#425046]">
                      From Page
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, splitPageCount)}
                      value={splitFrom}
                      onChange={(e) => setSplitFrom(Number(e.target.value))}
                      className="w-full rounded-lg border border-[#DDE3D8] px-3 py-2 font-mono text-sm tabular-nums focus:border-[#226847] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[#425046]">
                      To Page
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, splitPageCount)}
                      value={splitTo}
                      onChange={(e) => setSplitTo(Number(e.target.value))}
                      className="w-full rounded-lg border border-[#DDE3D8] px-3 py-2 font-mono text-sm tabular-nums focus:border-[#226847] focus:outline-none"
                    />
                  </div>
                </>
              )}

              {splitMode === "custom" && (
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-[#425046]">
                    Selected Pages (click thumbnails or type ranges)
                  </label>
                  <input
                    type="text"
                    value={splitCustom}
                    onChange={(e) => setSplitCustom(e.target.value)}
                    placeholder="1, 3, 5-8"
                    className="w-full rounded-lg border border-[#DDE3D8] px-3 py-2 font-mono text-sm focus:border-[#226847] focus:outline-none"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={runSplit}
                className="inline-flex items-center gap-2 rounded-xl bg-[#226847] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1B553A] disabled:opacity-50"
              >
                <Scissors className="h-4 w-4" />
                <span>Split PDF</span>
              </button>
            </div>

            {splitThumbnails.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-[#5C6B60]">
                  Page Previews (click to select)
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
                            ? "border-[#226847] ring-2 ring-[#226847]/25"
                            : "border-[#E4E8DF] hover:border-[#7FA585]"
                        }`}
                      >
                        <img
                          src={thumb.dataUrl}
                          alt={`Page ${thumb.pageNumber}`}
                          className="h-36 w-full bg-[#FAFBF8] object-contain"
                        />
                        <div
                          className={`border-t px-2 py-1.5 text-center font-mono text-xs tabular-nums ${
                            active
                              ? "border-[#C7DFCB] bg-[#EEF4EA] font-semibold text-[#226847]"
                              : "border-[#EAEDE6] text-[#637267]"
                          }`}
                        >
                          Page {thumb.pageNumber}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {splitResult && splitResult.kind === "single" && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#C7DFCB] bg-[#F2F8F3] p-4">
                <div className="flex items-center gap-2.5 text-sm text-[#1D2B22]">
                  <CheckCircle2 className="h-4 w-4 text-[#226847]" />
                  <span>
                    Extracted {splitResult.pageCount} page
                    {splitResult.pageCount > 1 ? "s" : ""} ·{" "}
                    <span className="font-mono text-xs">
                      {formatFileSize(splitResult.blob.size)}
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadBlob(splitResult.blob, splitResult.filename)
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#226847] px-4 py-2 text-xs font-medium text-white hover:bg-[#1B553A]"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download PDF</span>
                </button>
              </div>
            )}

            {splitResult && splitResult.kind === "multiple" && (
              <div className="space-y-3 rounded-xl border border-[#E4E8DF] bg-[#FAFBF8] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[#1D2B22]">
                    {splitResult.files.length} individual PDF pages ready
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      splitResult.files.forEach((f, idx) => {
                        setTimeout(
                          () => downloadBlob(f.blob, f.filename),
                          idx * 140
                        );
                      });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#226847] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1B553A]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download All</span>
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {splitResult.files.map((item) => (
                    <button
                      key={item.pageNumber}
                      type="button"
                      onClick={() => downloadBlob(item.blob, item.filename)}
                      className="flex items-center justify-between rounded-lg border border-[#E4E8DF] bg-white px-3 py-2 text-xs text-[#1D2B22] hover:border-[#226847]"
                    >
                      <span className="truncate font-mono">{item.filename}</span>
                      <Download className="h-3.5 w-3.5 shrink-0 text-[#226847]" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* COMPRESS */}
        {tool === "compress" && file && (
          <div className="space-y-5 border-t border-[#EAEDE6] pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#425046]">
                  Compression Strategy
                </label>
                <select
                  value={compressMode}
                  onChange={(e) =>
                    setCompressMode(
                      e.target.value as "balanced" | "strong" | "lossless"
                    )
                  }
                  className="w-full rounded-lg border border-[#DDE3D8] bg-white px-3 py-2 text-sm text-[#1D2B22] focus:border-[#226847] focus:outline-none"
                >
                  <option value="balanced">
                    Balanced (recompress heavy pages + optimize)
                  </option>
                  <option value="strong">Strong (maximum size reduction)</option>
                  <option value="lossless">
                    Lossless (strip metadata + object streams)
                  </option>
                </select>
              </div>

              {compressMode !== "lossless" && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[#425046]">
                    Image Quality:{" "}
                    <span className="font-mono text-[#226847] tabular-nums">
                      {compressQuality}%
                    </span>
                  </label>
                  <input
                    type="range"
                    min={20}
                    max={95}
                    value={compressQuality}
                    onChange={(e) => setCompressQuality(Number(e.target.value))}
                    className="mt-2 w-full accent-[#226847]"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={runCompress}
                className="inline-flex items-center gap-2 rounded-xl bg-[#226847] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1B553A] disabled:opacity-50"
              >
                <Minimize2 className="h-4 w-4" />
                <span>Compress PDF</span>
              </button>
            </div>

            {compressResult && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#C7DFCB] bg-[#F2F8F3] p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#226847]" />
                  <div>
                    <div className="text-sm font-semibold text-[#1D2B22]">
                      {compressResult.methodUsed}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-[#5C6B60] tabular-nums">
                      {formatFileSize(compressResult.originalSize)} →{" "}
                      {formatFileSize(compressResult.compressedSize)} (
                      {Math.max(
                        0,
                        Math.round(
                          ((compressResult.originalSize -
                            compressResult.compressedSize) /
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
                  onClick={() =>
                    downloadBlob(
                      compressResult.blob,
                      `compressed_${file.name}`
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#226847] px-4 py-2 text-xs font-medium text-white hover:bg-[#1B553A]"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Compressed PDF</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* PDF TO IMAGE */}
        {tool === "pdf-to-image" && file && (
          <div className="space-y-5 border-t border-[#EAEDE6] pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#425046]">
                  Image Format
                </label>
                <select
                  value={p2iFormat}
                  onChange={(e) =>
                    setP2iFormat(e.target.value as "png" | "jpeg")
                  }
                  className="w-full rounded-lg border border-[#DDE3D8] bg-white px-3 py-2 text-sm text-[#1D2B22] focus:border-[#226847] focus:outline-none"
                >
                  <option value="png">PNG (lossless)</option>
                  <option value="jpeg">JPEG (smaller file)</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#425046]">
                  Render Scale:{" "}
                  <span className="font-mono text-[#226847] tabular-nums">
                    {p2iScale}x
                  </span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.5}
                  value={p2iScale}
                  onChange={(e) => setP2iScale(Number(e.target.value))}
                  className="mt-2 w-full accent-[#226847]"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={runPdfToImage}
                className="inline-flex items-center gap-2 rounded-xl bg-[#226847] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1B553A] disabled:opacity-50"
              >
                <ImageDown className="h-4 w-4" />
                <span>Convert to Images</span>
              </button>
            </div>

            {p2iResults.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#1D2B22]">
                    Rendered Pages ({p2iResults.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      p2iResults.forEach((img, idx) => {
                        setTimeout(
                          () => downloadDataUrl(img.dataUrl, img.filename),
                          idx * 140
                        );
                      });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#226847] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1B553A]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download All Images</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {p2iResults.map((img) => (
                    <div
                      key={img.pageNumber}
                      className="overflow-hidden rounded-xl border border-[#E4E8DF] bg-white"
                    >
                      <img
                        src={img.dataUrl}
                        alt={`Page ${img.pageNumber}`}
                        className="h-44 w-full bg-[#FAFBF8] object-contain"
                      />
                      <div className="flex items-center justify-between border-t border-[#EAEDE6] px-3 py-2 text-xs">
                        <span className="font-mono text-[#637267] tabular-nums">
                          P.{img.pageNumber} · {img.width}×{img.height}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            downloadDataUrl(img.dataUrl, img.filename)
                          }
                          className="rounded p-1 text-[#226847] hover:bg-[#EEF4EA]"
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
      </div>
    </div>
  );
}
