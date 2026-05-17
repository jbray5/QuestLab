import { createContext, useCallback, useContext, useEffect, useState } from "react";

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
        {toasts.map((t) => (
          <div
            key={t.id}
            className="ql-modal-in"
            role="status"
            style={{
              padding: "0.6rem 0.85rem",
              background: "var(--surface)",
              border: `1px solid ${variantColor(t.variant)}`,
              borderLeft: `4px solid ${variantColor(t.variant)}`,
              borderRadius: 6,
              color: "var(--text)",
              fontSize: "0.85rem",
              boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
              pointerEvents: "auto",
            }}
          >
            <strong
              style={{
                color: variantColor(t.variant),
                marginRight: "0.4rem",
                textTransform: "uppercase",
                fontSize: "0.7rem",
                letterSpacing: "0.06em",
              }}
            >
              {labelFor(t.variant)}
            </strong>
            {t.message}
          </div>
        ))}
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
      return "var(--red, #ef5350)";
    case "success":
      return "var(--green2, #4caf50)";
    case "info":
    default:
      return "var(--gold)";
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
