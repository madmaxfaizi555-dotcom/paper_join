import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRESET_INSTRUCTIONS: Record<string, string> = {
  auto: "Detect the natural structure of the raw text (prose, list, email, or notes). Fix whitespace, broken line wraps, punctuation, and capitalization, and organize into clear paragraphs or bullet items while preserving every original fact and meaning.",
  paragraph: "Restructure the text into clean, well-punctuated, properly capitalized paragraphs without adding filler content.",
  essay: "Format the text into a cohesive multi-paragraph essay structure with clean transitions, proper punctuation, and consistent capitalization.",
  letter: "Format the text as a formal letter with greeting, structured body paragraphs, and closing sign-off where present.",
  email: "Format the text as a crisp, professional email with greeting, concise body paragraphs, bullet points if appropriate, and sign-off.",
  code: "Preserve code tokens and fix indentation, spacing, and block alignment cleanly without altering logic.",
  list: "Convert the raw items into a clean, uniformly formatted bulleted or numbered list with consistent capitalization.",
  article: "Format the text as a readable article with clear section headings (if implied by the text), well-paced paragraphs, and clean punctuation.",
  academic: "Format the text in formal academic prose with precise punctuation, clean paragraph structure, and consistent capitalization.",
};

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === "production";

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/format-text", async (req, res) => {
    const { rawText, preset = "auto", customInstruction = "" } = req.body ?? {};

    if (typeof rawText !== "string" || rawText.trim().length === 0) {
      res.status(400).json({ error: "Please provide raw text to format." });
      return;
    }

    if (rawText.length > 100000) {
      res.status(400).json({ error: "Text exceeds the 100,000 character limit for AI formatting." });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error: "AI formatting is unavailable because GEMINI_API_KEY is not configured in Secrets.",
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const presetGuide = PRESET_INSTRUCTIONS[preset] ?? PRESET_INSTRUCTIONS.auto;
      const extra = typeof customInstruction === "string" && customInstruction.trim()
        ? `\nAdditional user formatting preference: ${customInstruction.trim()}`
        : "";

      const systemInstruction =
        "You are a precision text formatter inside a document studio. " +
        "Your job is strictly to reformat, clean, punctuate, and structure the user's raw text. " +
        "Do NOT add commentary, preamble, explanations, or markdown code fences unless the preset is 'code'. " +
        "Preserve all factual content and meaning from the source text. " +
        presetGuide +
        extra;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: rawText,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const formattedText = (response.text ?? "").trim();
      if (!formattedText) {
        res.status(502).json({ error: "The model returned an empty formatting result." });
        return;
      }

      res.json({ formattedText });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to format text with AI.";
      console.error("AI format-text error:", message);
      res.status(500).json({ error: message });
    }
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      const indexFile = path.join(distDir, "index.html");
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send("Build artifacts not found. Run npm run build first.");
      }
    });
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`PaperJoin PDF Studio listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error("Server startup error:", err);
  process.exit(1);
});
