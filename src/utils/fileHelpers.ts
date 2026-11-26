import type { FileCategory } from "../types";

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val >= 100 || i === 0 ? Math.round(val) : parseFloat(val.toFixed(1))} ${sizes[i]}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

export function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

export function getFileCategory(file: File): FileCategory {
  const ext = getFileExtension(file.name);
  if (file.type === "application/pdf" || ext === "pdf") return "pdf";
  if (
    file.type.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(ext)
  ) {
    return "image";
  }
  if (
    file.type.startsWith("text/") ||
    ["txt", "md", "csv", "json", "html", "xml", "rtf", "log"].includes(ext)
  ) {
    return "text";
  }
  return "other";
}

export function parsePageRanges(input: string, maxPages: number): number[] {
  const pages = new Set<number>();
  const parts = input.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      const [rawStart, rawEnd] = trimmed.split("-");
      const start = Number(rawStart);
      const end = Number(rawEnd);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const lo = Math.max(1, Math.min(start, end));
      const hi = Math.min(maxPages, Math.max(start, end));
      for (let i = lo; i <= hi; i++) {
        pages.add(i - 1);
      }
    } else {
      const num = parseInt(trimmed, 10);
      if (Number.isFinite(num) && num >= 1 && num <= maxPages) {
        pages.add(num - 1);
      }
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}
