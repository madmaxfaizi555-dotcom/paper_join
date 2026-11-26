# PaperJoin PDF Studio

A clean, browser-local PDF and text workspace inspired by PaperJoin PDF Studio.

## Features

- **Merge & Create PDF**: Mix PDFs and images in any order, set optional per-PDF page ranges (e.g. `1-3, 5`), rotate images, configure page size/orientation/margins, and auto-name output using the second PDF's filename.
- **Global `Ctrl+V` File Paste**: Copy files or screenshots and press `Ctrl+V` anywhere to stage them directly into your file queue.
- **Split PDF**: Preview page thumbnails and extract all pages, a continuous page range, or custom page selections.
- **Compress PDF**: Reduce file size locally using lossless stream optimization or balanced/strong page recompression.
- **PDF to Image**: Export PDF pages as crisp PNG or JPEG images at 1x–4x scale.
- **Raw Text Formatter**: Clean spacing, fix punctuation, apply structure presets, run Find & Replace, export `.txt` / `.doc` / `.pdf`, and optionally use AI Smart Format when running with the Express server.

## Deploy to GitHub Pages

This repository includes `.github/workflows/deploy.yml` and relative asset paths (`base: './'` in `vite.config.ts`).

1. Push this project to the `main` branch of your GitHub repository.
2. Open **Settings → Pages** in your repository on GitHub.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. GitHub Actions will automatically run `npm run build` and publish `dist/` to `https://<your-username>.github.io/<your-repo-name>/`.

> All PDF processing, `Ctrl+V` pasting, and rule-based text formatting run 100% client-side on GitHub Pages. Only the optional **AI Smart Format** button requires running the Node.js server with `GEMINI_API_KEY`.

## Local Development & Full-Stack Hosting

```bash
npm install
npm run dev
```

For production full-stack hosting (e.g., Cloud Run, Render, Railway) with AI Smart Format enabled:

```bash
npm run build
NODE_ENV=production npm start
```

Set `GEMINI_API_KEY` in your environment variables or `.env` (see `.env.example`).
