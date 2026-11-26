export type WorkspaceView =
  | "overview"
  | "paste-zone"
  | "text-formatter"
  | "merge"
  | "split"
  | "compress"
  | "pdf-to-image"
  | "image-to-pdf";

export type FileCategory = "pdf" | "image" | "text" | "other";

export interface QueuedFile {
  id: string;
  file: File;
  category: FileCategory;
  previewUrl?: string;
  addedAt: number;
}

export type ToastTone = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

export interface TextStats {
  words: number;
  characters: number;
  lines: number;
  sentences: number;
}

export type FormatPreset =
  | "auto"
  | "paragraph"
  | "essay"
  | "letter"
  | "email"
  | "code"
  | "list"
  | "article"
  | "academic";

export type TextTransformAction =
  | "capitalize"
  | "uppercase"
  | "lowercase"
  | "titlecase"
  | "sentencecase"
  | "removeExtraSpaces"
  | "removeLineBreaks"
  | "addParagraphs"
  | "fixPunctuation"
  | "numberedList"
  | "bulletList"
  | "removeDuplicateLines"
  | "sortLines"
  | "reverseLines"
  | "trimLines"
  | "addLineNumbers";
