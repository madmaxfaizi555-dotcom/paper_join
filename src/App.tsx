import { useCallback, useEffect, useRef, useState } from "react";
import { PaperJoinStudio } from "./components/PaperJoinStudio";
import { PdfToolsView, type PdfUtilityId } from "./components/PdfToolsView";
import { TextFormatterView } from "./components/TextFormatterView";
import { ToastContainer } from "./components/ToastContainer";
import { TopBar } from "./components/TopBar";
import type {
  StudioFileItem,
  ToastItem,
  ToastTone,
  WorkspaceView,
} from "./types";
import { getFileCategory } from "./utils/fileHelpers";
import { getImageDimensions, getPdfPageCount } from "./utils/pdfEngine";

export default function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>("studio");
  const [studioItems, setStudioItems] = useState<StudioFileItem[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [utilitySeedFile, setUtilitySeedFile] = useState<File | undefined>(
    undefined
  );
  const [formatterSeedText, setFormatterSeedText] = useState<
    string | undefined
  >(undefined);

  const itemsRef = useRef<StudioFileItem[]>(studioItems);
  itemsRef.current = studioItems;

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

  const addStudioFiles = useCallback(
    (incoming: File[]) => {
      const supported: { file: File; kind: "pdf" | "image" }[] = [];
      const textFiles: File[] = [];
      let unsupportedCount = 0;

      for (const file of incoming) {
        const cat = getFileCategory(file);
        if (cat === "pdf") {
          supported.push({ file, kind: "pdf" });
        } else if (cat === "image") {
          supported.push({ file, kind: "image" });
        } else if (cat === "text") {
          textFiles.push(file);
        } else {
          unsupportedCount++;
        }
      }

      if (supported.length > 0) {
        const created: StudioFileItem[] = supported.map(({ file, kind }) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          file,
          kind,
          previewUrl:
            kind === "image" ? URL.createObjectURL(file) : undefined,
          pageRange: "",
          rotation: 0,
        }));

        setStudioItems((prev) => [...prev, ...created]);
        notify(
          `Added ${created.length} file${created.length > 1 ? "s" : ""}.`,
          "success"
        );

        // Hydrate PDF page counts & image dimensions asynchronously
        created.forEach((item) => {
          if (item.kind === "pdf") {
            void getPdfPageCount(item.file)
              .then((pageCount) => {
                setStudioItems((prev) =>
                  prev.map((curr) =>
                    curr.id === item.id ? { ...curr, pageCount } : curr
                  )
                );
              })
              .catch(() => {
                // Keep item usable even if page count inspection fails
              });
          } else {
            void getImageDimensions(item.file)
              .then(({ width, height }) => {
                setStudioItems((prev) =>
                  prev.map((curr) =>
                    curr.id === item.id ? { ...curr, width, height } : curr
                  )
                );
              })
              .catch(() => {
                // Keep item usable without pixel dimensions
              });
          }
        });
      }

      if (textFiles.length > 0 && supported.length === 0) {
        void Promise.all(textFiles.map((f) => f.text())).then((parts) => {
          setFormatterSeedText(parts.join("\n\n"));
          setActiveView("text-formatter");
          notify(`Loaded ${textFiles[0].name} into Text Formatter.`, "success");
        });
      }

      if (unsupportedCount > 0) {
        notify(
          `Skipped ${unsupportedCount} unsupported file${unsupportedCount > 1 ? "s" : ""}.`,
          "warning"
        );
      }
    },
    [notify]
  );

  const handleIncomingClipboardOrDrop = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;

      const isUtility =
        activeView === "split" ||
        activeView === "compress" ||
        activeView === "pdf-to-image";

      if (
        isUtility &&
        incoming.length === 1 &&
        getFileCategory(incoming[0]) === "pdf"
      ) {
        setUtilitySeedFile(incoming[0]);
        return;
      }

      const hasPdfOrImg = incoming.some((f) => {
        const c = getFileCategory(f);
        return c === "pdf" || c === "image";
      });

      if (hasPdfOrImg && activeView !== "studio") {
        setActiveView("studio");
      }

      addStudioFiles(incoming);
    },
    [activeView, addStudioFiles]
  );

  // Global Ctrl+V / Cmd+V listener
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
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
          const f = items[i].getAsFile();
          if (f) files.push(f);
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        handleIncomingClipboardOrDrop(files);
        return;
      }

      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (text && activeView === "text-formatter") {
        e.preventDefault();
        setFormatterSeedText(text);
        notify("Pasted text into formatter.", "success");
      }
    };

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [activeView, handleIncomingClipboardOrDrop, notify]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  const handleReadClipboardButton = async () => {
    if (!navigator.clipboard || !navigator.clipboard.read) {
      notify("Press Ctrl+V (or Cmd+V) directly to paste copied files.", "info");
      return;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      const collected: File[] = [];
      let textSnippet = "";

      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith("image/") || type === "application/pdf") {
            const blob = await item.getType(type);
            const ext = type.split("/")[1] || "bin";
            collected.push(
              new File([blob], `pasted-${Date.now()}.${ext}`, { type })
            );
          } else if (type === "text/plain" && !textSnippet) {
            const blob = await item.getType(type);
            textSnippet = await blob.text();
          }
        }
      }

      if (collected.length > 0) {
        handleIncomingClipboardOrDrop(collected);
      } else if (textSnippet.trim()) {
        setFormatterSeedText(textSnippet);
        setActiveView("text-formatter");
        notify("Pasted clipboard text into Text Formatter.", "success");
      } else {
        notify("No files or images found on clipboard. Try Ctrl+V.", "info");
      }
    } catch {
      notify("Press Ctrl+V directly anywhere on this page to paste copied files.", "info");
    }
  };

  const moveStudioItem = useCallback((index: number, delta: -1 | 1) => {
    setStudioItems((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(target, 0, moved);
      return copy;
    });
  }, []);

  const rotateStudioItem = useCallback((id: string) => {
    setStudioItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              rotation: (((item.rotation + 90) % 360) as 0 | 90 | 180 | 270),
            }
          : item
      )
    );
  }, []);

  const updatePageRange = useCallback((id: string, pageRange: string) => {
    setStudioItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, pageRange } : item))
    );
  }, []);

  const removeStudioItem = useCallback((id: string) => {
    setStudioItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const clearStudioItems = useCallback(() => {
    setStudioItems((prev) => {
      prev.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
  }, []);

  const isPdfUtility = (view: WorkspaceView): view is PdfUtilityId =>
    view === "split" || view === "compress" || view === "pdf-to-image";

  return (
    <div className="min-h-screen bg-[#F8F9F5] text-[#1D2B22] flex flex-col">
      <TopBar
        activeView={activeView}
        onSelectView={setActiveView}
        onReadClipboard={handleReadClipboardButton}
      />

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {activeView === "studio" && (
          <PaperJoinStudio
            items={studioItems}
            onAddFiles={addStudioFiles}
            onMoveItem={moveStudioItem}
            onRotateItem={rotateStudioItem}
            onUpdatePageRange={updatePageRange}
            onRemoveItem={removeStudioItem}
            onClearAll={clearStudioItems}
            onNotify={notify}
          />
        )}

        {isPdfUtility(activeView) && (
          <PdfToolsView
            tool={activeView}
            initialFile={utilitySeedFile}
            onConsumeInitialFile={() => setUtilitySeedFile(undefined)}
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
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
