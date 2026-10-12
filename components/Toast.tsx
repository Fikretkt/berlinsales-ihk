"use client";

// Minimaler Toast-Provider. Reicht aus für „Aktion gespeichert + Rückgängig".

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Undo2, X } from "lucide-react";

interface ToastEntry {
  id: number;
  message: string;
  durationMs: number;
  action?: {
    label: string;
    onClick: () => void | Promise<void>;
  };
}

interface ToastApi {
  show: (toast: Omit<ToastEntry, "id">) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast außerhalb von <ToastProvider/>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const show = useCallback((t: Omit<ToastEntry, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((curr) => [...curr, { ...t, id }]);
  }, []);

  function dismiss(id: number) {
    setToasts((curr) => curr.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[1500] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastEntry;
  onDismiss: () => void;
}) {
  const [remaining, setRemaining] = useState(toast.durationMs);

  useEffect(() => {
    if (!toast.action) {
      const t = setTimeout(onDismiss, toast.durationMs);
      return () => clearTimeout(t);
    }
    // Mit Action: Countdown anzeigen
    const tick = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1000));
    }, 1000);
    const dismissT = setTimeout(onDismiss, toast.durationMs);
    return () => {
      clearInterval(tick);
      clearTimeout(dismissT);
    };
  }, [toast.action, toast.durationMs, onDismiss]);

  const seconds = Math.ceil(remaining / 1000);
  return (
    <div className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
      <span className="flex-1">{toast.message}</span>
      <div className="flex items-center gap-2">
        {toast.action && (
          <button
            onClick={async () => {
              try {
                await toast.action!.onClick();
              } finally {
                onDismiss();
              }
            }}
            className="flex min-h-9 items-center gap-1 rounded-lg bg-white px-3 text-xs font-semibold text-gray-900 hover:bg-gray-100"
          >
            <Undo2 className="h-3 w-3" />
            {toast.action.label} ({seconds}s)
          </button>
        )}
        <button
          onClick={onDismiss}
          aria-label="Schließen"
          className="min-h-8 min-w-8 rounded-full p-1 text-gray-300 hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
