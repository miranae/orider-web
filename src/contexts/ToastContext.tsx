import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { Resolvable, type Resolve } from "../components/redesign/states/Resolvable";

type ToastType = "success" | "error" | "info";

export interface ToastOptions {
  /** 알림 문구를 누르면 해소하는 곳으로 간다(해결 화면 경로 또는 다시 시도). 버튼을 따로 붙이지 않는다. */
  resolve?: Resolve;
}

/** 누를 수 있는 알림은 읽고 누를 시간을 더 준다. */
export const TOAST_RESOLVE_MIN_DURATION_MS = 10000;

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  resolve?: Resolve;
  removing?: boolean;
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, options?: ToastOptions) => void;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  showToast: () => {},
  dismissToast: () => {},
});

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // 언마운트 뒤 남은 자동 닫기 타이머가 setState 를 부르지 않도록 대기 중인 타이머를 모아 둔다
  // (테스트에서는 jsdom 정리 뒤 타이머가 돌아 "window is not defined" 를 냈다).
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      callback();
    }, delay);
    timers.current.add(timer);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, removing: true } : t)),
    );
    schedule(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, [schedule]);

  const showToast = useCallback((message: string, type: ToastType = "success", options?: ToastOptions) => {
    const id = ++nextId;
    const resolve = options?.resolve;
    setToasts((prev) => [...prev, { id, message, type, ...(resolve ? { resolve } : {}) }]);
    const base = type === "error" ? 8000 : type === "info" ? 4000 : 2500;
    const duration = resolve ? Math.max(base, TOAST_RESOLVE_MIN_DURATION_MS) : base;
    schedule(() => {
      dismissToast(id);
    }, duration);
  }, [dismissToast, schedule]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      {/* Toast container */}
      {toasts.length > 0 && (
        <div className="fixed top-20 left-4 right-4 md:top-16 md:left-auto md:right-4 md:w-96 z-[100] space-y-3 pointer-events-none flex flex-col items-center md:items-end">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role={toast.type === "error" ? "alert" : "status"}
              aria-live={toast.type === "error" ? "assertive" : "polite"}
              className={`${
                toast.removing ? "animate-toast-out" : "animate-toast-in"
              } pointer-events-auto px-4 py-2.5 rounded-[var(--r-lg)] text-[length:var(--fs-sm)] font-medium flex items-center gap-2 ${
                toast.type === "success"
                  ? "text-[var(--color-success)]"
                  : toast.type === "error"
                    ? "text-[var(--color-error)]"
                    : "text-[var(--aqua)]"
              }`}
              style={{
                background: toast.type === "success"
                  ? "color-mix(in oklch, var(--color-success) 14%, var(--bg-1))"
                  : toast.type === "error"
                    ? "color-mix(in oklch, var(--color-error) 14%, var(--bg-1))"
                    : "color-mix(in oklch, var(--aqua) 14%, var(--bg-1))",
                border: `1px solid ${toast.type === "success"
                  ? "color-mix(in oklch, var(--color-success) 35%, var(--line-soft))"
                  : toast.type === "error"
                    ? "color-mix(in oklch, var(--color-error) 35%, var(--line-soft))"
                    : "color-mix(in oklch, var(--aqua) 35%, var(--line-soft))"}`,
                boxShadow: "var(--shadow-lg)",
              }}
            >
              {toast.type === "success" && (
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {toast.type === "error" && (
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <Resolvable resolve={toast.resolve} className="flex-1" onResolved={() => dismissToast(toast.id)}>{toast.message}</Resolvable>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="ml-2 rounded-[var(--r-sm)] px-1 text-[length:var(--fs-sm)] opacity-80 hover:opacity-100 focus:outline-none"
                aria-label="닫기"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
