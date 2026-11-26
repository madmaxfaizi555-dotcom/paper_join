import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Loader2,
  Plus,
  RotateCw,
  Upload,
  X,
} from "lucide-react";
import type {
  FilenameRule,
  MarginPreset,
  StudioFileItem,
  ToastTone,
} from "../types";
import { downloadBlob, formatFileSize, stripExtension } from "../utils/fileHelpers";
import { createCombinedPdf } from "../utils/pdfEngine";

interface PaperJoinStudioProps {
  items: StudioFileItem[];
  onAddFiles: (files: File[]) => void;
  onMoveItem: (index: number, delta: -1 | 1) => void;
  onRotateItem: (id: string) => void;
  onUpdatePageRange: (id: string, range: string) => void;
  onRemoveItem: (id: string) => void;
  onClearAll: () => void;
  onNotify: (message: string, tone?: ToastTone) => void;
}

export function PaperJoinStudio({
  items,
  onAddFiles,
  onMoveItem,
  onRotateItem,
  onUpdatePageRange,
  onRemoveItem,
  onClearAll,
  onNotify,
}: PaperJoinStudioProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Output filename settings
  const [filenameRule, setFilenameRule] = useState<FilenameRule>("second-pdf");
  const [customFilename, setCustomFilename] = useState("");

  // Image page settings
  const [pageSize, setPageSize] = useState<"a4" | "letter" | "fit">("a4");
  const [orientation, setOrientation] = useState<"auto" | "portrait" | "landscape">("auto");
  const [margins, setMargins] = useState<MarginPreset>("comfortable");

  // Creation state
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [result, setResult] = useState<{
    blob: Blob;
    filename: string;
    pageCount: number;
  } | null>(null);

  // Clear previous result whenever file list or settings change
  useEffect(() => {
    setResult(null);
  }, [items, pageSize, orientation, margins, filenameRule, customFilename]);

  const pdfItems = useMemo(() => items.filter((item) => item.kind === "pdf"), [items]);

  const derivedBaseName = useMemo(() => {
    if (filenameRule === "custom") {
      return customFilename.trim() || "combined-document";
    }
    if (filenameRule === "second-pdf") {
      if (pdfItems.length >= 2) return stripExtension(pdfItems[1].file.name);
      if (pdfItems.length === 1) return stripExtension(pdfItems[0].file.name);
      if (items.length > 0) return stripExtension(items[0].file.name);
      return "combined-document";
    }
    if (filenameRule === "first-pdf") {
      if (pdfItems.length >= 1) return stripExtension(pdfItems[0].file.name);
      if (items.length > 0) return stripExtension(items[0].file.name);
      return "combined-document";
    }
    if (items.length > 0) {
      return stripExtension(items[0].file.name);
    }
    return "combined-document";
  }, [customFilename, filenameRule, items, pdfItems]);

  const filenameHelperText = useMemo(() => {
    if (filenameRule === "custom") {
      return "Using your custom output filename.";
    }
    if (filenameRule === "second-pdf") {
      if (pdfItems.length === 0) {
        return "Add PDFs to auto-fill from the second PDF's filename.";
      }
      if (pdfItems.length === 1) {
        return "One PDF added: using its name until a second PDF is added.";
      }
      return `Two or more PDFs added: using "${stripExtension(pdfItems[1].file.name)}".`;
    }
    if (filenameRule === "first-pdf") {
      return pdfItems.length >= 1
        ? `Using the first PDF's name ("${stripExtension(pdfItems[0].file.name)}").`
        : "Add a PDF to use its filename automatically.";
    }
    return items.length >= 1
      ? `Using the first file's name ("${stripExtension(items[0].file.name)}").`
      : "Add files to auto-fill from the first file's name.";
  }, [filenameRule, items, pdfItems]);

  const totalBytes = useMemo(
    () => items.reduce((sum, item) => sum + item.file.size, 0),
    [items]
  );

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) {
      onAddFiles(dropped);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    if (picked.length > 0) {
      onAddFiles(picked);
    }
    e.target.value = "";
  };

  const handleCreatePdf = async () => {
    if (items.length === 0) {
      onNotify("Add at least one PDF or image file first.", "warning");
      return;
    }

    const sanitizedBase = derivedBaseName.replace(/[\\/:*?"<>|]+/g, "-").replace(/\.pdf$/i, "");
    const finalName = `${sanitizedBase || "combined-document"}.pdf`;

    setBusy(true);
    setProgress(0);
    setProgressLabel("Preparing files...");

    try {
      const output = await createCombinedPdf(
        items,
        { pageSize, orientation, margins },
        (pct, label) => {
          setProgress(pct);
          if (label) setProgressLabel(label);
        }
      );

      setResult({
        blob: output.blob,
        filename: finalName,
        pageCount: output.pageCount,
      });
      downloadBlob(output.blob, finalName);
      onNotify(`Created ${finalName} (${output.pageCount} pages).`, "success");
    } catch (err: unknown) {
      onNotify(
        err instanceof Error ? err.message : "Could not create PDF.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1160px] space-y-8 pb-8">
      {/* Hero Header matching reference screenshot */}
      <section className="flex flex-col justify-between gap-6 pt-2 md:flex-row md:items-center">
        <div className="max-w-xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5E6E63]">
            LESS FILE JUGGLING. MORE DONE.
          </div>
          <h1 className="mt-2.5 text-4xl font-semibold leading-[1.08] tracking-tight text-[#1D2B22] sm:text-[46px]">
            Many files.
            <br />
            <span className="text-[#226847]">One perfect PDF.</span>
          </h1>
          <p className="mt-3.5 text-sm leading-relaxed text-[#637267] sm:text-[15px]">
            Turn images and PDFs into one document.
            <br />
            In your order, with the right name.
          </p>
        </div>

        {/* Crisp Editorial SVG Card Illustration */}
        <div className="hidden shrink-0 md:block" aria-hidden="true">
          <svg
            width="290"
            height="176"
            viewBox="0 0 290 176"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Back JPG card */}
            <g transform="rotate(-11 88 92)">
              <rect
                x="34"
                y="24"
                width="108"
                height="132"
                rx="14"
                fill="#E3EBDC"
                stroke="#CFDDC7"
                strokeWidth="1"
              />
              <text
                x="48"
                y="45"
                fill="#5A725E"
                fontSize="10"
                fontWeight="600"
                fontFamily="DM Sans, sans-serif"
              >
                JPG
              </text>
              <circle cx="88" cy="92" r="24" fill="#C7D7C2" />
              <path
                d="M66 95C76 95 96 95 110 95"
                stroke="#E3EBDC"
                strokeWidth="5"
              />
            </g>

            {/* Front PDF card */}
            <g transform="rotate(6 178 88)">
              <rect
                x="116"
                y="18"
                width="124"
                height="144"
                rx="14"
                fill="#FFFFFF"
                stroke="#E2E7DE"
                strokeWidth="1.2"
              />
              <rect x="130" y="34" width="30" height="16" rx="4" fill="#EEF4EA" />
              <text
                x="136"
                y="45"
                fill="#226847"
                fontSize="8.5"
                fontWeight="700"
                fontFamily="DM Sans, sans-serif"
              >
                PDF
              </text>
              <text
                x="130"
                y="76"
                fill="#1D2B22"
                fontSize="14"
                fontWeight="700"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                All together.
              </text>
              <rect x="130" y="92" width="88" height="6" rx="3" fill="#EEF1EB" />
              <rect x="130" y="105" width="94" height="6" rx="3" fill="#EEF1EB" />
              <rect x="130" y="118" width="66" height="6" rx="3" fill="#EEF1EB" />
            </g>

            {/* Star accent */}
            <g transform="translate(248 24)" stroke="#88A889" strokeWidth="1.6" strokeLinecap="round">
              <line x1="0" y1="-9" x2="0" y2="9" />
              <line x1="-9" y1="0" x2="9" y2="0" />
              <line x1="-6" y1="-6" x2="6" y2="6" />
              <line x1="6" y1="-6" x2="-6" y2="6" />
            </g>

            {/* Green Check Badge */}
            <circle cx="222" cy="142" r="15" fill="#226847" />
            <path
              d="M216.5 142L220.2 145.7L227.5 138.4"
              stroke="#FFFFFF"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </section>

      {/* Main Unified Studio Card */}
      <section className="overflow-hidden rounded-[20px] border border-[#E4E8DF] bg-white shadow-[0_8px_30px_rgba(24,39,28,0.04)]">
        <div className="grid lg:grid-cols-12">
          {/* LEFT PANE: 01 Your files */}
          <div className="flex flex-col justify-between border-b border-[#EAEDE6] p-6 sm:p-8 lg:col-span-7 lg:border-b-0 lg:border-r">
            <div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#D7DDD2] font-mono text-[11px] font-medium text-[#5C6B60] tabular-nums">
                    01
                  </span>
                  <h2 className="text-[15px] font-semibold text-[#1D2B22]">
                    Your files
                  </h2>
                  <span className="rounded bg-[#EEF2EA] px-2 py-0.5 font-mono text-xs font-medium text-[#4C5C50] tabular-nums">
                    {items.length}
                  </span>
                </div>

                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearAll}
                    className="text-xs font-medium text-[#667369] transition-colors hover:text-[#1D2B22]"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {/* Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className={`mt-5 cursor-pointer rounded-xl border-[1.5px] border-dashed px-6 py-8 text-center transition-colors ${
                  dragOver
                    ? "border-[#226847] bg-[#E8F0E2]"
                    : "border-[#BDD0BE] bg-[#F2F6EE] hover:border-[#7FA585]"
                }`}
              >
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-[#DCE4D7] bg-white text-[#226847]">
                  <Upload className="h-4 w-4" />
                </div>
                <div className="mt-3.5 text-[15px] font-semibold text-[#1D2B22]">
                  Drop your files here
                </div>
                <p className="mt-1 text-xs text-[#637267]">
                  Mix images and PDFs. We&apos;ll bring them together.
                </p>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#26322A] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#19231D]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Choose files</span>
                </button>

                <div className="mt-3 text-[11px] text-[#7A877D]">
                  JPG, PNG, WEBP &amp; PDF · Up to 100 MB total · Paste with Ctrl+V
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.bmp,image/*,application/pdf"
                  hidden
                  onChange={handleFileInput}
                />
              </div>

              {/* Mixed PDF & Image List */}
              {items.length > 0 && (
                <div className="mt-4 divide-y divide-[#EAEDE6] border-t border-b border-[#EAEDE6]">
                  {items.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 py-3.5"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        {item.kind === "pdf" ? (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F7EBE8] font-mono text-[11px] font-semibold text-[#B86B5E]">
                            PDF
                          </div>
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#E4E8DF] bg-[#F7F8F4]">
                            {item.previewUrl && (
                              <img
                                src={item.previewUrl}
                                alt={item.file.name}
                                className="h-full w-full object-cover transition-transform duration-150"
                                style={{
                                  transform: `rotate(${item.rotation}deg)`,
                                }}
                              />
                            )}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-[#1D2B22]">
                            {item.file.name}
                          </div>
                          <div className="mt-0.5 font-mono text-xs text-[#6B786D] tabular-nums">
                            {item.kind === "pdf" ? (
                              <>
                                {item.pageCount !== undefined
                                  ? `${item.pageCount} page${item.pageCount === 1 ? "" : "s"}`
                                  : "PDF"}{" "}
                                · {formatFileSize(item.file.size)}
                              </>
                            ) : (
                              <>
                                {item.width && item.height
                                  ? `${item.width} × ${item.height} px · `
                                  : ""}
                                {formatFileSize(item.file.size)}
                                {item.rotation > 0 ? ` · ${item.rotation}°` : ""}
                              </>
                            )}
                          </div>

                          {item.kind === "pdf" && (
                            <input
                              type="text"
                              value={item.pageRange}
                              onChange={(e) => onUpdatePageRange(item.id, e.target.value)}
                              placeholder="All pages · e.g. 1-3, 5"
                              aria-label={`Page range for ${item.file.name}`}
                              className="mt-2 w-full max-w-[200px] rounded-md border border-[#DDE3D8] bg-white px-2.5 py-1 text-xs text-[#1D2B22] placeholder:text-[#8E9B90] focus:border-[#226847] focus:outline-none"
                            />
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1 pt-0.5">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onMoveItem(idx, -1)}
                          aria-label={`Move ${item.file.name} up`}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E4E8DF] text-[#5C6B60] transition-colors hover:bg-[#F2F6EE] disabled:opacity-35"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === items.length - 1}
                          onClick={() => onMoveItem(idx, 1)}
                          aria-label={`Move ${item.file.name} down`}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E4E8DF] text-[#5C6B60] transition-colors hover:bg-[#F2F6EE] disabled:opacity-35"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        {item.kind === "image" && (
                          <button
                            type="button"
                            onClick={() => onRotateItem(item.id)}
                            aria-label={`Rotate ${item.file.name} 90 degrees`}
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E4E8DF] text-[#5C6B60] transition-colors hover:bg-[#F2F6EE]"
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.id)}
                          aria-label={`Remove ${item.file.name}`}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E4E8DF] text-[#5C6B60] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="mt-4 text-[11px] text-[#7A877D]">
              Use the arrows to set the final page order. PDF page ranges are optional.
            </p>
          </div>

          {/* RIGHT PANE: 02 Make it yours */}
          <div className="flex flex-col justify-between p-6 sm:p-8 lg:col-span-5">
            <div className="space-y-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#D7DDD2] font-mono text-[11px] font-medium text-[#5C6B60] tabular-nums">
                  02
                </span>
                <h2 className="text-[15px] font-semibold text-[#1D2B22]">
                  Make it yours
                </h2>
              </div>

              {/* Output filename */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-[#425046]">
                  Output filename
                </label>
                <select
                  value={filenameRule}
                  onChange={(e) => {
                    const next = e.target.value as FilenameRule;
                    setFilenameRule(next);
                    if (next === "custom" && !customFilename) {
                      setCustomFilename(derivedBaseName);
                    }
                  }}
                  aria-label="Output filename rule"
                  className="w-full rounded-lg border border-[#DDE3D8] bg-white px-3 py-2.5 text-sm text-[#1D2B22] focus:border-[#226847] focus:outline-none"
                >
                  <option value="second-pdf">Use second PDF&apos;s name</option>
                  <option value="first-pdf">Use first PDF&apos;s name</option>
                  <option value="first-file">Use first file&apos;s name</option>
                  <option value="custom">Custom filename</option>
                </select>

                <div className="flex items-center overflow-hidden rounded-lg border border-[#DDE3D8] bg-white focus-within:border-[#226847]">
                  <input
                    type="text"
                    value={filenameRule === "custom" ? customFilename : derivedBaseName}
                    onChange={(e) => {
                      setFilenameRule("custom");
                      setCustomFilename(e.target.value);
                    }}
                    placeholder="combined-document"
                    aria-label="Output PDF filename"
                    className="w-full px-3 py-2 text-sm text-[#1D2B22] focus:outline-none"
                  />
                  <span className="pr-3 font-mono text-xs text-[#7A877D]">.pdf</span>
                </div>

                <p className="text-[11px] text-[#7A877D]">{filenameHelperText}</p>
              </div>

              <div className="border-t border-[#EAEDE6] pt-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5C6B60]">
                    IMAGE PAGE SETTINGS
                  </span>
                  <span className="text-[11px] text-[#839085]">
                    PDF pages stay original
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#425046] mb-1.5">
                      Page size
                    </label>
                    <select
                      value={pageSize}
                      onChange={(e) =>
                        setPageSize(e.target.value as "a4" | "letter" | "fit")
                      }
                      className="w-full rounded-lg border border-[#DDE3D8] bg-white px-3 py-2 text-sm text-[#1D2B22] focus:border-[#226847] focus:outline-none"
                    >
                      <option value="a4">A4</option>
                      <option value="letter">Letter</option>
                      <option value="fit">Fit to Image</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#425046] mb-1.5">
                      Orientation
                    </label>
                    <select
                      value={orientation}
                      onChange={(e) =>
                        setOrientation(
                          e.target.value as "auto" | "portrait" | "landscape"
                        )
                      }
                      className="w-full rounded-lg border border-[#DDE3D8] bg-white px-3 py-2 text-sm text-[#1D2B22] focus:border-[#226847] focus:outline-none"
                    >
                      <option value="auto">Auto</option>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#425046] mb-1.5">
                    Page margins
                  </label>
                  <select
                    value={margins}
                    onChange={(e) => setMargins(e.target.value as MarginPreset)}
                    className="w-full rounded-lg border border-[#DDE3D8] bg-white px-3 py-2 text-sm text-[#1D2B22] focus:border-[#226847] focus:outline-none"
                  >
                    <option value="comfortable">Comfortable</option>
                    <option value="minimal">Minimal</option>
                    <option value="none">None</option>
                    <option value="wide">Wide</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between text-xs text-[#637267]">
                <span>In the order shown</span>
                <span className="font-mono font-medium text-[#1D2B22] tabular-nums">
                  {items.length} file{items.length === 1 ? "" : "s"} ·{" "}
                  {formatFileSize(totalBytes)}
                </span>
              </div>

              {busy && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-[#425046]">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#226847]" />
                      {progressLabel}
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

              <button
                type="button"
                disabled={busy || items.length === 0}
                onClick={handleCreatePdf}
                className="flex w-full items-center justify-between rounded-xl bg-[#226847] px-5 py-3.5 text-sm font-medium text-white transition-colors hover:bg-[#1B553A] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>{busy ? "Creating PDF..." : "Create PDF"}</span>
                <ArrowUpRight className="h-4 w-4" />
              </button>

              {result ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[#C7DFCB] bg-[#F2F8F3] px-3.5 py-2.5 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#226847]" />
                    <span className="truncate font-medium text-[#1D2B22]">
                      {result.filename} ({result.pageCount}p ·{" "}
                      {formatFileSize(result.blob.size)})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadBlob(result.blob, result.filename)}
                    className="inline-flex shrink-0 items-center gap-1 font-semibold text-[#226847] hover:underline"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Save again
                  </button>
                </div>
              ) : (
                <p className="text-center text-[11px] text-[#7A877D]">
                  {items.length > 0
                    ? "Files added. Arrange them, then create your PDF."
                    : "Drop, paste (Ctrl+V), or choose files on the left to begin."}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
