import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import type { ToastItem } from "../types";

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] sm:w-auto"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const icon =
          toast.tone === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#226847]" />
          ) : toast.tone === "error" ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          ) : toast.tone === "warning" ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          ) : (
            <Info className="h-4 w-4 shrink-0 text-[#226847]" />
          );

        return (
          <div
            key={toast.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[#E4E8DF] bg-white px-4 py-3 text-sm text-[#1D2B22] shadow-[0_8px_24px_rgba(24,39,28,0.08)]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {icon}
              <span className="truncate">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded p-1 text-[#7A877D] hover:bg-[#F2F6EE] hover:text-[#1D2B22] shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
