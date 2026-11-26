import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { MarginPreset, StudioFileItem } from "../types";
import { parsePageRanges } from "./fileHelpers";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type ProgressCallback = (percent: number, label?: string) => void;

export interface PdfThumbnail {
  pageNumber: number;
  dataUrl: string;
}

export interface RenderedPageImage {
  pageNumber: number;
  dataUrl: string;
  filename: string;
  width: number;
  height: number;
}

const MARGIN_POINTS: Record<MarginPreset, number> = {
  none: 0,
  minimal: 16,
  comfortable: 34,
  wide: 54,
};

export async function getPdfPageCount(file: File): Promise<number> {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return pdf.getPageCount();
}

export async function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const dims = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const img = new Image();
        img.onload = () =>
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error("Could not read image dimensions"));
        img.src = url;
      }
    );
    return dims;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderRotatedImageJpegOrPng(
  file: File,
  rotation: 0 | 90 | 180 | 270
): Promise<{ kind: "png" | "jpg"; bytes: ArrayBuffer }> {
  if (rotation === 0 && file.type === "image/png") {
    return { kind: "png", bytes: await file.arrayBuffer() };
  }
  if (rotation === 0 && (file.type === "image/jpeg" || file.type === "image/jpg")) {
    return { kind: "jpg", bytes: await file.arrayBuffer() };
  }

  const blob = new Blob([await file.arrayBuffer()], {
    type: file.type || "image/png",
  });
  const bitmap = await createImageBitmap(blob);
  const swap = rotation === 90 || rotation === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? bitmap.height : bitmap.width;
  canvas.height = swap ? bitmap.width : bitmap.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas context unavailable");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();

  const jpgBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.93)
  );
  if (!jpgBlob) throw new Error("Failed to encode image");
  return { kind: "jpg", bytes: await jpgBlob.arrayBuffer() };
}

export async function createCombinedPdf(
  items: StudioFileItem[],
  options: {
    pageSize: "a4" | "letter" | "fit";
    orientation: "auto" | "portrait" | "landscape";
    margins: MarginPreset;
  },
  onProgress?: ProgressCallback
): Promise<{ blob: Blob; pageCount: number }> {
  const outDoc = await PDFDocument.create();
  const margin = MARGIN_POINTS[options.margins];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(
      Math.round((i / items.length) * 90),
      `Processing ${item.file.name}...`
    );

    if (item.kind === "pdf") {
      const bytes = await item.file.arrayBuffer();
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const total = src.getPageCount();
      const indices = item.pageRange.trim()
        ? parsePageRanges(item.pageRange, total)
        : src.getPageIndices();

      if (indices.length === 0) {
        throw new Error(
          `No valid pages matched "${item.pageRange}" in ${item.file.name} (${total} pages).`
        );
      }

      const copied = await outDoc.copyPages(src, indices);
      copied.forEach((p) => outDoc.addPage(p));
    } else {
      const encoded = await renderRotatedImageJpegOrPng(item.file, item.rotation);
      const embedded =
        encoded.kind === "png"
          ? await outDoc.embedPng(encoded.bytes)
          : await outDoc.embedJpg(encoded.bytes);

      let pageWidth: number;
      let pageHeight: number;

      if (options.pageSize === "fit") {
        pageWidth = embedded.width + margin * 2;
        pageHeight = embedded.height + margin * 2;
      } else {
        const sizes: Record<"a4" | "letter", [number, number]> = {
          a4: [595.28, 841.89],
          letter: [612, 792],
        };
        [pageWidth, pageHeight] = sizes[options.pageSize];
        const usePortrait =
          options.orientation === "auto"
            ? embedded.width / embedded.height < 1
            : options.orientation === "portrait";
        if (!usePortrait) {
          [pageWidth, pageHeight] = [pageHeight, pageWidth];
        }
      }

      const page = outDoc.addPage([pageWidth, pageHeight]);
      const availW = Math.max(10, pageWidth - margin * 2);
      const availH = Math.max(10, pageHeight - margin * 2);
      const scale = Math.min(availW / embedded.width, availH / embedded.height);
      const drawW = embedded.width * scale;
      const drawH = embedded.height * scale;

      page.drawImage(embedded, {
        x: (pageWidth - drawW) / 2,
        y: (pageHeight - drawH) / 2,
        width: drawW,
        height: drawH,
      });
    }
  }

  onProgress?.(96, "Finalizing PDF...");
  const saved = await outDoc.save();
  onProgress?.(100, "Done");

  return {
    blob: new Blob([new Uint8Array(saved)], { type: "application/pdf" }),
    pageCount: outDoc.getPageCount(),
  };
}

export async function getPdfInfoAndThumbnails(
  file: File,
  maxThumbnails = 24,
  onProgress?: ProgressCallback
): Promise<{ pageCount: number; thumbnails: PdfThumbnail[] }> {
  const bytes = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const countToRender = Math.min(pageCount, maxThumbnails);
  const thumbnails: PdfThumbnail[] = [];

  for (let i = 1; i <= countToRender; i++) {
    onProgress?.(
      Math.round((i / countToRender) * 100),
      `Rendering preview ${i} of ${countToRender}...`
    );
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 0.45 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");
    if (ctx) {
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      thumbnails.push({
        pageNumber: i,
        dataUrl: canvas.toDataURL("image/png"),
      });
    }
  }

  return { pageCount, thumbnails };
}

export type SplitResult =
  | { kind: "single"; blob: Blob; filename: string; pageCount: number }
  | {
      kind: "multiple";
      files: { blob: Blob; filename: string; pageNumber: number }[];
    };

export async function splitPdfFile(
  file: File,
  mode: "all" | "range" | "custom",
  options: { from?: number; to?: number; custom?: string },
  onProgress?: ProgressCallback
): Promise<SplitResult> {
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const totalPages = src.getPageCount();
  const baseName = file.name.replace(/\.pdf$/i, "");

  if (mode === "all") {
    const outputs: { blob: Blob; filename: string; pageNumber: number }[] = [];
    for (let i = 0; i < totalPages; i++) {
      onProgress?.(
        Math.round(((i + 1) / totalPages) * 100),
        `Extracting page ${i + 1} of ${totalPages}...`
      );
      const doc = await PDFDocument.create();
      const [page] = await doc.copyPages(src, [i]);
      doc.addPage(page);
      const out = await doc.save();
      outputs.push({
        blob: new Blob([new Uint8Array(out)], { type: "application/pdf" }),
        filename: `${baseName}_page_${i + 1}.pdf`,
        pageNumber: i + 1,
      });
    }
    return { kind: "multiple", files: outputs };
  }

  let indices: number[] = [];
  if (mode === "range") {
    const from = Math.max(1, Math.min(totalPages, options.from ?? 1)) - 1;
    const to =
      Math.max(1, Math.min(totalPages, options.to ?? totalPages)) - 1;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let i = lo; i <= hi; i++) indices.push(i);
  } else {
    indices = parsePageRanges(options.custom ?? "", totalPages);
  }

  if (indices.length === 0) {
    throw new Error("No valid pages selected. Check your page range.");
  }

  onProgress?.(40, `Extracting ${indices.length} pages...`);
  const doc = await PDFDocument.create();
  const copied = await doc.copyPages(src, indices);
  copied.forEach((p) => doc.addPage(p));
  onProgress?.(90, "Saving extracted PDF...");
  const out = await doc.save();
  onProgress?.(100, "Done");

  return {
    kind: "single",
    blob: new Blob([new Uint8Array(out)], { type: "application/pdf" }),
    filename: `${baseName}_extracted.pdf`,
    pageCount: indices.length,
  };
}

export async function compressPdfFile(
  file: File,
  mode: "lossless" | "balanced" | "strong",
  quality: number,
  onProgress?: ProgressCallback
): Promise<{
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  methodUsed: string;
}> {
  const bytes = await file.arrayBuffer();
  const originalSize = file.size;

  onProgress?.(15, "Optimizing PDF object streams...");
  const losslessDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  losslessDoc.setTitle("");
  losslessDoc.setAuthor("");
  losslessDoc.setSubject("");
  losslessDoc.setKeywords([]);
  losslessDoc.setProducer("");
  losslessDoc.setCreator("");
  const losslessOut = await losslessDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    objectsPerTick: 100,
  });
  const losslessBlob = new Blob([new Uint8Array(losslessOut)], {
    type: "application/pdf",
  });

  if (mode === "lossless") {
    onProgress?.(100, "Done");
    return {
      blob:
        losslessBlob.size < originalSize
          ? losslessBlob
          : new Blob([bytes], { type: "application/pdf" }),
      originalSize,
      compressedSize: Math.min(losslessBlob.size, originalSize),
      methodUsed: "Lossless stream optimization",
    };
  }

  const renderScale = mode === "strong" ? 1.0 : 1.35;
  const jpegQuality = Math.min(0.95, Math.max(0.2, quality / 100));

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const recompressedDoc = await PDFDocument.create();

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(
      20 + Math.round((i / pdf.numPages) * 70),
      `Recompressing page ${i} of ${pdf.numPages}...`
    );
    const page = await pdf.getPage(i);
    const origViewport = page.getViewport({ scale: 1 });
    const renderViewport = page.getViewport({ scale: renderScale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(renderViewport.width));
    canvas.height = Math.max(1, Math.floor(renderViewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport: renderViewport })
      .promise;

    const jpgBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", jpegQuality)
    );
    if (!jpgBlob) continue;
    const jpgBytes = await jpgBlob.arrayBuffer();
    const embedded = await recompressedDoc.embedJpg(jpgBytes);
    const outPage = recompressedDoc.addPage([
      origViewport.width,
      origViewport.height,
    ]);
    outPage.drawImage(embedded, {
      x: 0,
      y: 0,
      width: origViewport.width,
      height: origViewport.height,
    });
  }

  onProgress?.(95, "Finalizing compressed PDF...");
  const recompressedOut = await recompressedDoc.save({ useObjectStreams: true });
  const recompressedBlob = new Blob([new Uint8Array(recompressedOut)], {
    type: "application/pdf",
  });
  onProgress?.(100, "Done");

  if (
    recompressedBlob.size < losslessBlob.size &&
    recompressedBlob.size < originalSize
  ) {
    return {
      blob: recompressedBlob,
      originalSize,
      compressedSize: recompressedBlob.size,
      methodUsed:
        mode === "strong"
          ? "Strong page compression"
          : "Balanced page compression",
    };
  }

  if (losslessBlob.size < originalSize) {
    return {
      blob: losslessBlob,
      originalSize,
      compressedSize: losslessBlob.size,
      methodUsed: "Lossless stream optimization (smallest output)",
    };
  }

  return {
    blob: new Blob([bytes], { type: "application/pdf" }),
    originalSize,
    compressedSize: originalSize,
    methodUsed: "Already maximally optimized",
  };
}

export async function renderPdfToImages(
  file: File,
  format: "png" | "jpeg",
  scale: number,
  onProgress?: ProgressCallback
): Promise<RenderedPageImage[]> {
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const baseName = file.name.replace(/\.pdf$/i, "");
  const results: RenderedPageImage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(
      Math.round((i / pdf.numPages) * 100),
      `Rendering page ${i} of ${pdf.numPages}...`
    );
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    if (format === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL(`image/${format}`, 0.92);
    results.push({
      pageNumber: i,
      dataUrl,
      filename: `${baseName}_page_${i}.${format}`,
      width: canvas.width,
      height: canvas.height,
    });
  }

  return results;
}
