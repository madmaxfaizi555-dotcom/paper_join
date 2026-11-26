import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
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

export async function mergePdfFiles(
  files: File[],
  onProgress?: ProgressCallback
): Promise<{ blob: Blob; pageCount: number }> {
  const merged = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    onProgress?.(Math.round((i / files.length) * 85), `Merging ${files[i].name}...`);
    const bytes = await files[i].arrayBuffer();
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const copiedPages = await merged.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((p) => merged.addPage(p));
  }

  onProgress?.(95, "Finalizing merged PDF...");
  const out = await merged.save();
  onProgress?.(100, "Done");
  return {
    blob: new Blob([new Uint8Array(out)], { type: "application/pdf" }),
    pageCount: merged.getPageCount(),
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
    onProgress?.(Math.round((i / countToRender) * 100), `Rendering preview ${i} of ${countToRender}...`);
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
  | { kind: "multiple"; files: { blob: Blob; filename: string; pageNumber: number }[] };

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
      onProgress?.(Math.round(((i + 1) / totalPages) * 100), `Extracting page ${i + 1} of ${totalPages}...`);
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
    const to = Math.max(1, Math.min(totalPages, options.to ?? totalPages)) - 1;
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
): Promise<{ blob: Blob; originalSize: number; compressedSize: number; methodUsed: string }> {
  const bytes = await file.arrayBuffer();
  const originalSize = file.size;

  // Always compute lossless structure-optimized PDF first
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
  const losslessBlob = new Blob([new Uint8Array(losslessOut)], { type: "application/pdf" });

  if (mode === "lossless") {
    onProgress?.(100, "Done");
    return {
      blob: losslessBlob.size < originalSize ? losslessBlob : new Blob([bytes], { type: "application/pdf" }),
      originalSize,
      compressedSize: Math.min(losslessBlob.size, originalSize),
      methodUsed: "Lossless stream optimization",
    };
  }

  // Recompress pages for balanced or strong modes
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
    await page.render({ canvas, canvasContext: ctx, viewport: renderViewport }).promise;

    const jpgBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", jpegQuality)
    );
    if (!jpgBlob) continue;
    const jpgBytes = await jpgBlob.arrayBuffer();
    const embedded = await recompressedDoc.embedJpg(jpgBytes);
    const outPage = recompressedDoc.addPage([origViewport.width, origViewport.height]);
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

  if (recompressedBlob.size < losslessBlob.size && recompressedBlob.size < originalSize) {
    return {
      blob: recompressedBlob,
      originalSize,
      compressedSize: recompressedBlob.size,
      methodUsed: mode === "strong" ? "Strong page compression" : "Balanced page compression",
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
    onProgress?.(Math.round((i / pdf.numPages) * 100), `Rendering page ${i} of ${pdf.numPages}...`);
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

export async function imagesToPdf(
  files: File[],
  options: {
    pageSize: "a4" | "letter" | "fit";
    orientation: "portrait" | "landscape" | "auto";
    margin: number;
  },
  onProgress?: ProgressCallback
): Promise<{ blob: Blob; pageCount: number }> {
  const pdf = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    onProgress?.(Math.round((i / files.length) * 90), `Embedding ${files[i].name}...`);
    const file = files[i];
    const imgBytes = await file.arrayBuffer();
    let embedded;

    if (file.type === "image/png") {
      embedded = await pdf.embedPng(imgBytes);
    } else if (file.type === "image/jpeg" || file.type === "image/jpg") {
      embedded = await pdf.embedJpg(imgBytes);
    } else {
      const blob = new Blob([imgBytes], { type: file.type || "image/png" });
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0);
      }
      bitmap.close();
      const jpgBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92)
      );
      if (!jpgBlob) continue;
      embedded = await pdf.embedJpg(await jpgBlob.arrayBuffer());
    }

    let pageWidth: number;
    let pageHeight: number;

    if (options.pageSize === "fit") {
      pageWidth = embedded.width + options.margin * 2;
      pageHeight = embedded.height + options.margin * 2;
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

    const page = pdf.addPage([pageWidth, pageHeight]);
    const availW = Math.max(10, pageWidth - options.margin * 2);
    const availH = Math.max(10, pageHeight - options.margin * 2);
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

  onProgress?.(96, "Generating PDF...");
  const out = await pdf.save();
  onProgress?.(100, "Done");

  return {
    blob: new Blob([new Uint8Array(out)], { type: "application/pdf" }),
    pageCount: pdf.getPageCount(),
  };
}
