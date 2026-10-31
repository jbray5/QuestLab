import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Info, type LucideIcon } from "lucide-react";

type ToastVariant = "error" | "info" | "success";

interface ToastEntry {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  push: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Tiny global toast system (Plan 00029).
 *
 * Wrap the app in <ToastProvider> and call ``useToast().push("...")`` from
 * anywhere. The API client also dispatches a window event (``ql:api-error``)
 * which the provider listens for, so transient API failures surface even
 * outside React-Query's onError handlers.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const push = useCallback((message: string, variant: ToastVariant = "error") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  // Bridge for non-React callers (the API client lives outside the React tree).
  useEffect(() => {
    function onErr(e: Event) {
      const detail = (e as CustomEvent<{ message: string }>).detail;
      if (detail?.message) push(detail.message, "error");
    }
    window.addEventListener("ql:api-error", onErr);
    return () => window.removeEventListener("ql:api-error", onErr);
  }, [push]);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 11000,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          maxWidth: "min(420px, calc(100vw - 32px))",
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => {
          const Icon = iconFor(t.variant);
          return (
            <div
              key={t.id}
              className="ql-modal-in"
              role="status"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.55rem",
                padding: "0.65rem 0.9rem",
                background: "var(--surface2)",
                border: `1px solid ${borderFor(t.variant)}`,
                borderRadius: 8,
                color: "var(--text)",
                fontSize: "0.9375rem",
                lineHeight: 1.45,
                boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
                pointerEvents: "auto",
              }}
            >
              <Icon size={16} aria-hidden style={{ color: variantColor(t.variant), marginTop: 3 }} />
              <span>
                <strong style={{ color: variantColor(t.variant), marginRight: "0.4rem", fontWeight: 600 }}>
                  {labelFor(t.variant)}
                </strong>
                {t.message}
              </span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      push: (msg) => console.warn("[toast (no provider)]", msg),
    };
  }
  return ctx;
}

function variantColor(v: ToastVariant): string {
  switch (v) {
    case "error":
      return "var(--danger-text)";
    case "success":
      return "var(--teal-text)";
    case "info":
    default:
      return "var(--text2)";
  }
}

function borderFor(v: ToastVariant): string {
  return v === "error" ? "var(--danger-line)" : "var(--border2)";
}

function iconFor(v: ToastVariant): LucideIcon {
  switch (v) {
    case "error":
      return CircleAlert;
    case "success":
      return CircleCheck;
    case "info":
    default:
      return Info;
  }
}

function labelFor(v: ToastVariant): string {
  switch (v) {
    case "error":
      return "Error";
    case "success":
      return "Done";
    case "info":
    default:
      return "Note";
  }
}
