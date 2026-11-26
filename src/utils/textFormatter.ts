import { jsPDF } from "jspdf";
import type { FormatPreset, TextStats, TextTransformAction } from "../types";
import { downloadBlob } from "./fileHelpers";

export const SAMPLE_RAW_TEXT = `   hello   world!!  this is   an example   of messy   RAW text copied from a pdf   or website...
it has   weird    spacing ,missing capitalization,  broken
line wraps that interrupt   sentences and   no clear paragraphs.
  also some   duplicate   lines below:
first important note about project timeline
first important note about project timeline
second note: review budget   before friday!
third note - share   the final draft with the team.`;

export function computeTextStats(text: string): TextStats {
  const trimmed = text.trim();
  if (!trimmed) {
    return { words: 0, characters: text.length, lines: 0, sentences: 0 };
  }
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const characters = text.length;
  const lines = text.split(/\r?\n/).length;
  const sentences = trimmed
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;

  return { words, characters, lines, sentences };
}

function toSentenceCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/(^\s*\w|[.!?]\s+\w|\n\s*\w)/g, (match) => match.toUpperCase());
}

function toTitleCase(input: string): string {
  const minorWords = new Set([
    "a", "an", "and", "as", "at", "but", "by", "for", "if",
    "in", "nor", "of", "on", "or", "per", "so", "the", "to", "up", "via", "yet",
  ]);
  return input
    .split(/(\s+)/)
    .map((token, idx, arr) => {
      if (/^\s+$/.test(token)) return token;
      const lower = token.toLowerCase();
      const isFirst = idx === 0;
      const isLast = idx === arr.length - 1;
      if (!isFirst && !isLast && minorWords.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function cleanSpaces(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fixPunctuationSpacing(input: string): string {
  return input
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])([^\s\d"'”)\]])/g, "$1 $2")
    .replace(/\.{2,}/g, "...")
    .replace(/!{2,}/g, "!")
    .replace(/\?{2,}/g, "?");
}

function groupIntoParagraphs(input: string, sentencesPerParagraph = 3): string {
  const normalized = cleanSpaces(input).replace(/\n+/g, " ");
  const fixed = toSentenceCase(fixPunctuationSpacing(normalized));
  const sentences = fixed.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [fixed];
  const paragraphs: string[] = [];

  for (let i = 0; i < sentences.length; i += sentencesPerParagraph) {
    const chunk = sentences
      .slice(i, i + sentencesPerParagraph)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
    if (chunk) paragraphs.push(chunk);
  }
  return paragraphs.join("\n\n");
}

export function applyTextTransform(
  text: string,
  action: TextTransformAction
): string {
  if (!text) return "";

  switch (action) {
    case "capitalize":
      return text.replace(/\b\w/g, (c) => c.toUpperCase());
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "titlecase":
      return toTitleCase(text);
    case "sentencecase":
      return toSentenceCase(text);
    case "removeExtraSpaces":
      return cleanSpaces(text);
    case "removeLineBreaks":
      return text.replace(/\r?\n+/g, " ").replace(/\s{2,}/g, " ").trim();
    case "addParagraphs":
      return groupIntoParagraphs(text, 3);
    case "fixPunctuation":
      return toSentenceCase(fixPunctuationSpacing(cleanSpaces(text)));
    case "numberedList": {
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
        .filter(Boolean);
      return lines.map((l, i) => `${i + 1}. ${toSentenceCase(l)}`).join("\n");
    }
    case "bulletList": {
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
        .filter(Boolean);
      return lines.map((l) => `• ${toSentenceCase(l)}`).join("\n");
    }
    case "removeDuplicateLines": {
      const seen = new Set<string>();
      return text
        .split(/\r?\n/)
        .filter((line) => {
          const key = line.trim();
          if (!key) return true;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .join("\n");
    }
    case "sortLines":
      return text
        .split(/\r?\n/)
        .sort((a, b) => a.localeCompare(b))
        .join("\n");
    case "reverseLines":
      return text.split(/\r?\n/).reverse().join("\n");
    case "trimLines":
      return text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .join("\n");
    case "addLineNumbers":
      return text
        .split(/\r?\n/)
        .map((l, i) => `${String(i + 1).padStart(2, "0")}. ${l}`)
        .join("\n");
  }
}

export function applyFormatPreset(text: string, preset: FormatPreset): string {
  const cleaned = cleanSpaces(text);
  if (!cleaned) return "";

  switch (preset) {
    case "auto": {
      const lines = cleaned.split("\n").filter(Boolean);
      const listLikeCount = lines.filter((l) => /^([-*•]|\d+[.)])\s+/.test(l)).length;
      if (lines.length >= 3 && listLikeCount >= Math.ceil(lines.length / 2)) {
        return lines
          .map((l) => `• ${toSentenceCase(l.replace(/^([-*•]|\d+[.)])\s+/, ""))}`)
          .join("\n");
      }
      return groupIntoParagraphs(cleaned, 3);
    }
    case "paragraph":
      return groupIntoParagraphs(cleaned, 3);
    case "essay": {
      const lines = cleaned.split("\n").filter(Boolean);
      if (lines.length > 1 && lines[0].length < 80 && !/[.!?]$/.test(lines[0])) {
        const title = toTitleCase(lines[0]);
        const body = groupIntoParagraphs(lines.slice(1).join(" "), 4);
        return `${title}\n\n${body}`;
      }
      return groupIntoParagraphs(cleaned, 4);
    }
    case "letter": {
      const body = groupIntoParagraphs(cleaned, 3);
      const hasGreeting = /^(dear|hello|hi|to whom)/i.test(body);
      const hasClosing = /(sincerely|regards|best|faithfully)/i.test(body);
      const parts: string[] = [];
      if (!hasGreeting) parts.push("Dear Recipient,");
      parts.push(body);
      if (!hasClosing) parts.push("Sincerely,\n[Your Name]");
      return parts.join("\n\n");
    }
    case "email": {
      const body = groupIntoParagraphs(cleaned, 2);
      const hasGreeting = /^(hi|hello|dear|hey)/i.test(body);
      const hasClosing = /(best|regards|thanks|thank you|sincerely)/i.test(body);
      const parts: string[] = [];
      if (!hasGreeting) parts.push("Hi there,");
      parts.push(body);
      if (!hasClosing) parts.push("Best regards,\n[Your Name]");
      return parts.join("\n\n");
    }
    case "code": {
      return text
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((l) => l.replace(/\s+$/, ""))
        .join("\n")
        .trim();
    }
    case "list": {
      const items = cleaned
        .split(/\n+/)
        .map((l) => l.replace(/^([-*•]|\d+[.)])\s*/, "").trim())
        .filter(Boolean);
      return items.map((item) => `• ${toSentenceCase(fixPunctuationSpacing(item))}`).join("\n");
    }
    case "article": {
      const lines = cleaned.split("\n").filter(Boolean);
      const heading =
        lines[0].length < 90 ? toTitleCase(lines[0].replace(/[.!?]+$/, "")) : "Formatted Article";
      const rest = lines.length > 1 && lines[0].length < 90 ? lines.slice(1).join(" ") : cleaned;
      return `${heading}\n${"=".repeat(Math.min(heading.length, 48))}\n\n${groupIntoParagraphs(rest, 3)}`;
    }
    case "academic":
      return groupIntoParagraphs(cleaned, 4);
  }
}

export function findAndReplaceText(
  text: string,
  find: string,
  replace: string,
  caseSensitive = false
): { updated: string; count: number } {
  if (!find) return { updated: text, count: 0 };
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flags = caseSensitive ? "g" : "gi";
  const regex = new RegExp(escaped, flags);
  const matches = text.match(regex);
  const count = matches ? matches.length : 0;
  return { updated: text.replace(regex, replace), count };
}

export function exportTextAsTxt(text: string, filename = "formatted-text.txt"): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  downloadBlob(blob, filename);
}

export function exportTextAsDoc(text: string, filename = "formatted-text.doc"): void {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split(/\n\n+/)
    .map((p) => `<p style="margin:0 0 12pt 0;line-height:1.6;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Formatted Document</title></head>
<body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#0f172a;">
${escaped}
</body>
</html>`;

  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  downloadBlob(blob, filename);
}

export function exportTextAsPdf(text: string, filename = "formatted-text.pdf"): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 52;
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  const paragraphs = text.split(/\r?\n/);
  let cursorY = margin;

  for (const para of paragraphs) {
    if (para.trim() === "") {
      cursorY += lineHeight * 0.7;
      if (cursorY > pageHeight - margin) {
        doc.addPage();
        cursorY = margin;
      }
      continue;
    }

    const wrapped = doc.splitTextToSize(para, maxWidth) as string[];
    for (const line of wrapped) {
      if (cursorY > pageHeight - margin) {
        doc.addPage();
        cursorY = margin;
      }
      doc.text(line, margin, cursorY);
      cursorY += lineHeight;
    }
  }

  doc.save(filename);
}
