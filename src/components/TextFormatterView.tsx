import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  AlertCircle,
  ClipboardPaste,
  Copy,
  Download,
  FileDown,
  FileText,
  Loader2,
  Replace,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import type { FormatPreset, TextTransformAction, ToastTone } from "../types";
import {
  SAMPLE_RAW_TEXT,
  applyFormatPreset,
  applyTextTransform,
  computeTextStats,
  exportTextAsDoc,
  exportTextAsPdf,
  exportTextAsTxt,
  findAndReplaceText,
} from "../utils/textFormatter";

interface TextFormatterViewProps {
  initialText?: string;
  onConsumeInitialText?: () => void;
  onNotify: (message: string, tone?: ToastTone) => void;
}

const PRESET_OPTIONS: { value: FormatPreset; label: string }[] = [
  { value: "auto", label: "Auto Detect & Format" },
  { value: "paragraph", label: "Paragraph Format" },
  { value: "essay", label: "Essay Format" },
  { value: "letter", label: "Letter Format" },
  { value: "email", label: "Email Format" },
  { value: "code", label: "Code Format" },
  { value: "list", label: "List Format" },
  { value: "article", label: "Article Format" },
  { value: "academic", label: "Academic Format" },
];

const QUICK_ACTIONS: { action: TextTransformAction; label: string }[] = [
  { action: "sentencecase", label: "Sentence case" },
  { action: "titlecase", label: "Title Case" },
  { action: "capitalize", label: "Capitalize" },
  { action: "uppercase", label: "UPPER" },
  { action: "lowercase", label: "lower" },
  { action: "removeExtraSpaces", label: "Clean Spaces" },
  { action: "removeLineBreaks", label: "Remove Breaks" },
  { action: "addParagraphs", label: "Add Paragraphs" },
  { action: "fixPunctuation", label: "Fix Punctuation" },
  { action: "bulletList", label: "Bullet List" },
  { action: "numberedList", label: "Numbered List" },
  { action: "removeDuplicateLines", label: "Remove Duplicates" },
  { action: "sortLines", label: "Sort Lines" },
  { action: "reverseLines", label: "Reverse Lines" },
  { action: "trimLines", label: "Trim Lines" },
  { action: "addLineNumbers", label: "Line Numbers" },
];

export function TextFormatterView({
  initialText,
  onConsumeInitialText,
  onNotify,
}: TextFormatterViewProps) {
  const [rawText, setRawText] = useState("");
  const [formattedText, setFormattedText] = useState("");
  const [preset, setPreset] = useState<FormatPreset>("auto");
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialText) {
      setRawText(initialText);
      setFormattedText(applyFormatPreset(initialText, preset));
      onConsumeInitialText?.();
    }
  }, [initialText, onConsumeInitialText, preset]);

  const inputStats = computeTextStats(rawText);
  const outputStats = computeTextStats(formattedText);

  const runPreset = (nextPreset = preset) => {
    if (!rawText.trim()) {
      onNotify("Enter or paste raw text first.", "warning");
      return;
    }
    setAiError(null);
    const result = applyFormatPreset(rawText, nextPreset);
    setFormattedText(result);
    onNotify("Applied rule-based formatting.", "success");
  };

  const runAction = (action: TextTransformAction) => {
    const source = formattedText.trim() ? formattedText : rawText;
    if (!source.trim()) {
      onNotify("Enter or paste raw text first.", "warning");
      return;
    }
    setAiError(null);
    const updated = applyTextTransform(source, action);
    setFormattedText(updated);
  };

  const runAiFormat = async () => {
    if (!rawText.trim()) {
      onNotify("Enter or paste raw text to format with AI.", "warning");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/format-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText, preset }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "AI formatting request failed.");
      }
      setFormattedText(data.formattedText);
      onNotify("Formatted with AI Smart Format.", "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "AI formatting failed.";
      setAiError(msg);
      onNotify(msg, "error");
    } finally {
      setAiLoading(false);
    }
  };

  const handleFindReplace = () => {
    if (!findQuery) {
      onNotify("Enter text to find.", "warning");
      return;
    }
    const base = formattedText.trim() ? formattedText : rawText;
    if (!base) return;
    const { updated, count } = findAndReplaceText(
      base,
      findQuery,
      replaceQuery,
      caseSensitive
    );
    setFormattedText(updated);
    onNotify(
      count > 0 ? `Replaced ${count} occurrence${count > 1 ? "s" : ""}.` : "No matches found.",
      count > 0 ? "success" : "info"
    );
  };

  const handlePasteRaw = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        onNotify("Clipboard has no plain text.", "warning");
        return;
      }
      setRawText(text);
      onNotify("Pasted text from clipboard.", "success");
    } catch {
      onNotify("Click the Raw Input box and press Ctrl+V to paste.", "info");
    }
  };

  const handleUploadText = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawText(text);
    setFormattedText(applyFormatPreset(text, preset));
    e.target.value = "";
    onNotify(`Loaded ${file.name}.`, "success");
  };

  const handleCopyOutput = async () => {
    if (!formattedText.trim()) {
      onNotify("Nothing formatted to copy yet.", "warning");
      return;
    }
    try {
      await navigator.clipboard.writeText(formattedText);
      onNotify("Formatted text copied to clipboard.", "success");
    } catch {
      onNotify("Copy failed. Select the output text and press Ctrl+C.", "error");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Raw Text Formatter</h1>
          <p className="mt-1 text-sm text-slate-600">
            Clean messy raw text into structured paragraphs, lists, or correspondence with instant
            rule presets or AI Smart Format.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Format Preset"
            value={preset}
            onChange={(e) => {
              const next = e.target.value as FormatPreset;
              setPreset(next);
              if (rawText.trim()) {
                setFormattedText(applyFormatPreset(rawText, next));
              }
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
          >
            {PRESET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => runPreset()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <Wand2 className="h-4 w-4 text-indigo-600" />
            <span>Apply Preset</span>
          </button>

          <button
            type="button"
            disabled={aiLoading}
            onClick={runAiFormat}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap"
          >
            {aiLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span>{aiLoading ? "Formatting..." : "AI Smart Format"}</span>
          </button>
        </div>
      </div>

      {aiError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-medium">AI formatting error:</span> {aiError}
          </div>
        </div>
      )}

      {/* Transformations & Find/Replace */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map((item) => (
            <button
              key={item.action}
              type="button"
              onClick={() => runAction(item.action)}
              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 whitespace-nowrap"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <input
            type="text"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            placeholder="Find text..."
            className="min-w-[160px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
          />
          <input
            type="text"
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            placeholder="Replace with..."
            className="min-w-[160px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
          />
          <label className="flex items-center gap-1.5 text-xs text-slate-600 px-1 whitespace-nowrap cursor-pointer">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Match case
          </label>
          <button
            type="button"
            onClick={handleFindReplace}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Replace className="h-3.5 w-3.5 text-slate-500" />
            <span>Replace All</span>
          </button>
        </div>
      </div>

      {/* Split Editor Workbench */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Raw Input */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <span className="text-xs font-semibold text-slate-700">Raw Text Input</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handlePasteRaw}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 whitespace-nowrap"
              >
                <ClipboardPaste className="h-3 w-3" />
                Paste
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 whitespace-nowrap"
              >
                <Upload className="h-3 w-3" />
                Load File
              </button>
              <button
                type="button"
                onClick={() => {
                  setRawText(SAMPLE_RAW_TEXT);
                  setFormattedText(applyFormatPreset(SAMPLE_RAW_TEXT, preset));
                }}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 whitespace-nowrap"
              >
                <FileText className="h-3 w-3" />
                Sample
              </button>
              <button
                type="button"
                onClick={() => {
                  setRawText("");
                  setFormattedText("");
                  setAiError(null);
                }}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50 whitespace-nowrap"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.csv,.log"
                hidden
                onChange={handleUploadText}
              />
            </div>
          </div>

          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste messy, unformatted text here (e.g., copied PDF text, broken line wraps, missing capitalization)..."
            className="min-h-[380px] w-full flex-1 resize-y p-4 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />

          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 font-mono text-xs text-slate-500 tabular-nums">
            {inputStats.words} words · {inputStats.characters} chars · {inputStats.lines} lines ·{" "}
            {inputStats.sentences} sentences
          </div>
        </div>

        {/* Formatted Output */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <span className="text-xs font-semibold text-slate-700">Formatted Output</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyOutput}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 whitespace-nowrap"
              >
                <Copy className="h-3 w-3" />
                Copy
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!formattedText.trim()) {
                    onNotify("Format text before exporting.", "warning");
                    return;
                  }
                  exportTextAsTxt(formattedText);
                  onNotify("Downloaded .txt file.", "success");
                }}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 whitespace-nowrap"
              >
                <Download className="h-3 w-3" />
                .TXT
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!formattedText.trim()) {
                    onNotify("Format text before exporting.", "warning");
                    return;
                  }
                  exportTextAsDoc(formattedText);
                  onNotify("Downloaded .doc file.", "success");
                }}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 whitespace-nowrap"
              >
                <FileDown className="h-3 w-3" />
                .DOC
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!formattedText.trim()) {
                    onNotify("Format text before exporting.", "warning");
                    return;
                  }
                  exportTextAsPdf(formattedText);
                  onNotify("Exported PDF document.", "success");
                }}
                className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 whitespace-nowrap"
              >
                <FileDown className="h-3 w-3" />
                Export PDF
              </button>
            </div>
          </div>

          <textarea
            value={formattedText}
            onChange={(e) => setFormattedText(e.target.value)}
            placeholder="Formatted output will appear here. You can also edit it directly before exporting..."
            className={`min-h-[380px] w-full flex-1 resize-y p-4 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none ${
              preset === "code" ? "font-mono text-xs" : ""
            }`}
          />

          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 font-mono text-xs text-slate-500 tabular-nums">
            {outputStats.words} words · {outputStats.characters} chars · {outputStats.lines} lines ·{" "}
            {outputStats.sentences} sentences
          </div>
        </div>
      </div>
    </div>
  );
}
