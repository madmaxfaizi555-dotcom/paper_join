export type WorkspaceView =
  | "studio"
  | "split"
  | "compress"
  | "pdf-to-image"
  | "text-formatter";

export type FileCategory = "pdf" | "image" | "text" | "other";

export type FilenameRule =
  | "second-pdf"
  | "first-pdf"
  | "first-file"
  | "custom";

export type MarginPreset = "comfortable" | "minimal" | "none" | "wide";

export interface StudioFileItem {
  id: string;
  file: File;
  kind: "pdf" | "image";
  previewUrl?: string;
  pageCount?: number;
  pageRange: string;
  width?: number;
  height?: number;
  rotation: 0 | 90 | 180 | 270;
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
