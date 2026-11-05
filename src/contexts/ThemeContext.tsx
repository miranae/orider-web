import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "orider.theme";
const THEME_CHANGE_EVENT = "orider:themechange";
export const HOST_THEME_CHANGE_EVENT = "orider:hostthemechange";

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {}
  return "system";
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyResolvedToHtml(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.setAttribute("data-theme", resolved);
  html.style.colorScheme = resolved;
  // 차트 등 비-React 코드가 즉시 재계산할 수 있도록 이벤트 발행
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { resolved } }));
}

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children, forceDark = false, hostControlled = false }: {
  children: ReactNode;
  forceDark?: boolean;
  hostControlled?: boolean;
}) {
  const [theme, setThemeState] = useState<ThemePreference>(() => readStoredPreference());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());

  const [hostTheme, setHostTheme] = useState<ResolvedTheme | null>(null);
  // 앱 임베드는 브라우저 저장 설정보다 승인된 호스트의 화면 정책을 우선한다.
  useEffect(() => {
    setHostTheme(null);
    if (!hostControlled) return;
    const onHostTheme = (event: Event) => {
      const mode: unknown = (event as CustomEvent).detail?.mode;
      if (mode === "light" || mode === "dark") setHostTheme(mode);
    };
    window.addEventListener(HOST_THEME_CHANGE_EVENT, onHostTheme);
    return () => window.removeEventListener(HOST_THEME_CHANGE_EVENT, onHostTheme);
  }, [hostControlled]);
  const resolvedTheme: ResolvedTheme = forceDark ? "dark"
    : hostControlled && hostTheme ? hostTheme : theme === "system" ? systemTheme : theme;

  // OS 변경 감지
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // 적용
  const lastResolvedRef = useRef<ResolvedTheme | null>(null);
  useEffect(() => {
    if (lastResolvedRef.current !== resolvedTheme) {
      lastResolvedRef.current = resolvedTheme;
    }
    applyResolvedToHtml(resolvedTheme);
  }, [theme, resolvedTheme]);

  const setTheme = useCallback((next: ThemePreference) => {
    try {
      if (next === "system") {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {}
    setThemeState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

// 비-React 환경(차트 useMemo 등)에서 쓰는 헬퍼
export function getResolvedTheme(): ResolvedTheme {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
  }
  return getSystemTheme();
}

export function isDarkTheme(): boolean {
  return getResolvedTheme() === "dark";
}

export const THEME_CHANGE_EVENT_NAME = THEME_CHANGE_EVENT;
