import { useCallback, useEffect, useRef, useState } from "react";
import { PdfToolsView, type PdfToolId } from "./components/PdfToolsView";
import { QuickPasteZone } from "./components/QuickPasteZone";
import { Sidebar } from "./components/Sidebar";
import { TextFormatterView } from "./components/TextFormatterView";
import { ToastContainer } from "./components/ToastContainer";
import { TopBar } from "./components/TopBar";
import { WorkspaceOverview } from "./components/WorkspaceOverview";
import type { QueuedFile, ToastItem, ToastTone, WorkspaceView } from "./types";
import { createQueuedFile } from "./utils/fileHelpers";

export default function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Handoff state when routing from Quick Paste to a tool
  const [toolSeedFiles, setToolSeedFiles] = useState<File[] | undefined>(undefined);
  const [formatterSeedText, setFormatterSeedText] = useState<string | undefined>(undefined);

  const queuedRef = useRef<QueuedFile[]>(queuedFiles);
  queuedRef.current = queuedFiles;

  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addPastedOrDroppedFiles = useCallback(
    (incoming: File[], switchToPaste = false) => {
      if (incoming.length === 0) return;
      const items = incoming.map((f) => createQueuedFile(f));
      setQueuedFiles((prev) => [...prev, ...items]);
      if (switchToPaste) {
        setActiveView("paste-zone");
      }
      notify(
        `Staged ${incoming.length} file${incoming.length > 1 ? "s" : ""} in Quick Paste.`,
        "success"
      );
    },
    [notify]
  );

  const removeQueuedFile = useCallback((id: string) => {
    setQueuedFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const clearQueuedFiles = useCallback(() => {
    setQueuedFiles((prev) => {
      prev.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
    notify("Cleared Quick Paste queue.", "info");
  }, [notify]);

  // Cleanup any remaining preview URLs on unmount
  useEffect(() => {
    return () => {
      queuedRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  // Global Ctrl+V / Cmd+V paste listener
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || active?.isContentEditable) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === "file") {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        addPastedOrDroppedFiles(files, activeView !== "paste-zone");
        return;
      }

      // When user is explicitly in Quick Paste Zone, also capture pasted plain text as a .txt file
      if (activeView === "paste-zone") {
        const pastedText = e.clipboardData?.getData("text/plain")?.trim();
        if (pastedText) {
          e.preventDefault();
          const txtFile = new File(
            [pastedText],
            `pasted-text-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.txt`,
            { type: "text/plain" }
          );
          addPastedOrDroppedFiles([txtFile], false);
        }
      }
    };

    document.addEventListener("paste", handleGlobalPaste);
    return () => document.removeEventListener("paste", handleGlobalPaste);
  }, [activeView, addPastedOrDroppedFiles]);

  const handleRouteToTool = useCallback((tool: WorkspaceView, files: File[]) => {
    setToolSeedFiles(files);
    setActiveView(tool);
  }, []);

  const handleRouteTextToFormatter = useCallback(
    (text: string, sourceName: string) => {
      setFormatterSeedText(text);
      setActiveView("text-formatter");
      notify(`Loaded ${sourceName} into Text Formatter.`, "success");
    },
    [notify]
  );

  const isPdfTool = (view: WorkspaceView): view is PdfToolId =>
    view === "merge" ||
    view === "split" ||
    view === "compress" ||
    view === "pdf-to-image" ||
    view === "image-to-pdf";

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        pastedCount={queuedFiles.length}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          activeView={activeView}
          onSelectView={setActiveView}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          pastedCount={queuedFiles.length}
        />

        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {activeView === "overview" && (
            <WorkspaceOverview
              onSelectView={setActiveView}
              onDropFiles={(files) => addPastedOrDroppedFiles(files, true)}
            />
          )}

          {activeView === "paste-zone" && (
            <QuickPasteZone
              queuedFiles={queuedFiles}
              onAddFiles={(files) => addPastedOrDroppedFiles(files, false)}
              onRemoveFile={removeQueuedFile}
              onClearFiles={clearQueuedFiles}
              onRouteToTool={handleRouteToTool}
              onRouteTextToFormatter={handleRouteTextToFormatter}
              onNotify={notify}
            />
          )}

          {activeView === "text-formatter" && (
            <TextFormatterView
              initialText={formatterSeedText}
              onConsumeInitialText={() => setFormatterSeedText(undefined)}
              onNotify={notify}
            />
          )}

          {isPdfTool(activeView) && (
            <PdfToolsView
              tool={activeView}
              initialFiles={toolSeedFiles}
              onConsumeInitialFiles={() => setToolSeedFiles(undefined)}
              onNotify={notify}
            />
          )}
        </main>
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
