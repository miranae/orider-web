import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { Resolvable, type Resolve } from "../components/redesign/states/Resolvable";
import { Toast as ToastView, ToastViewport } from "../theme/components";

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
      {toasts.length > 0 && (
        <ToastViewport>
          {toasts.map((toast) => (
            <ToastView
              key={toast.id}
              tone={toast.type}
              leaving={toast.removing}
              onDismiss={() => dismissToast(toast.id)}
              dismissLabel="닫기"
            >
              <Resolvable resolve={toast.resolve} onResolved={() => dismissToast(toast.id)}>{toast.message}</Resolvable>
            </ToastView>
          ))}
        </ToastViewport>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
