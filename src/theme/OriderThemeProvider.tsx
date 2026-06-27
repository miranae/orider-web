import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useTheme, type ResolvedTheme } from '../contexts/ThemeContext';
import type { OriderTheme, OriderThemeVariant } from './OriderTheme';
import { DEFAULT_THEME, THEMES, type ThemeId } from './themes';

/**
 * 디자인 시스템 Provider — 앱(Compose `LocalOriderTheme`) 패턴의 웹 포팅.
 *
 * 책임:
 * 1. 사용자 선택 테마 id 보관 (`localStorage("orider.designTheme")`)
 * 2. `ThemeContext` 의 `resolvedTheme` (light/dark) 와 결합해 variant 선택
 * 3. 선택된 variant 의 색·치수·타이포 토큰을 `<html>` inline CSS 변수로 주입
 *    → `index.css` 의 기본 토큰을 cascade 로 오버라이드
 * 4. JS 컴포넌트(차트 등) 에서 토큰을 직접 읽을 수 있도록 `useOriderTheme()` 제공
 */

const STORAGE_KEY = 'orider.designTheme';

interface OriderThemeContextValue {
  /** 현재 적용된 테마 (id, label, tokens 포함). */
  theme: OriderTheme;
  /** 현재 light/dark variant — 색·차트 토큰. */
  variant: OriderThemeVariant;
  /** 등록된 모든 테마. 설정 UI 에서 옵션 노출용. */
  availableThemes: OriderTheme[];
  /** 테마 교체. id 가 등록되지 않은 경우 무시. */
  setThemeId: (id: ThemeId) => void;
}

const OriderThemeContext = createContext<OriderThemeContextValue | null>(null);

function readStoredId(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME.id;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && THEMES[v]) return v;
  } catch {}
  return DEFAULT_THEME.id;
}

/** kebab-case 변환 (typography key `dataHero` → `data-hero`). */
function toKebab(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/**
 * 토큰을 `<html>` inline style 로 주입.
 *
 * 매핑:
 * - colors      → `--bg-0`, `--ink-0` 등 (기존 index.css 변수와 1:1)
 * - chartColors → `--chart-{key}`, `--grid-soft/--grid-axis` (기존 호환)
 * - dimens      → `--space-*`, `--r-*` (기존 호환) + `--dim-*` (확장)
 * - typography  → `--fs-data-hero`, `--fw-*` 등 `--ft-{kebab}-{prop}`
 */
function applyToRoot(theme: OriderTheme, variant: OriderThemeVariant) {
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;

  // --- Colors → index.css 변수 호환 매핑 ---
  const c = variant.colors;
  style.setProperty('--bg-0', c.background);
  style.setProperty('--bg-1', c.surface);
  style.setProperty('--bg-2', c.surfaceVariant);
  style.setProperty('--bg-3', c.surfaceElevated);
  style.setProperty('--bg-4', c.surfaceHigh);
  style.setProperty('--line', c.border);
  style.setProperty('--line-soft', c.divider);
  style.setProperty('--ink-0', c.textPrimary);
  style.setProperty('--ink-1', c.textSecondary);
  style.setProperty('--ink-2', c.textTertiary);
  style.setProperty('--ink-3', c.textQuaternary);
  style.setProperty('--ink-4', c.textDisabled);
  style.setProperty('--lime', c.accent);
  style.setProperty('--lime-dim', c.accentLight);
  // --accent: 컴포넌트 CSS (.ds-btn--primary 등) 가 직접 var(--accent) 를 참조해 왔으나
  // 옛 provider 는 --lime 만 노출해 폴백 fail → 라이트 테마에서 primary 버튼 배경 투명.
  // --accent + --accent-dark 둘 다 명시적으로 노출해 컴포넌트 CSS 가 의도대로 동작.
  style.setProperty('--accent', c.accent);
  style.setProperty('--accent-dark', c.accentDark);
  style.setProperty('--aqua', c.info);
  style.setProperty('--amber', c.warning);
  style.setProperty('--rose', c.error);
  style.setProperty('--primary-fg', c.primaryFg);
  style.setProperty('--accent-soft-bg', c.accentSoftBg);
  style.setProperty('--accent-soft-border', c.accentSoftBorder);
  style.setProperty('--zone-1', c.zone1);
  style.setProperty('--zone-2', c.zone2);
  style.setProperty('--zone-3', c.zone3);
  style.setProperty('--zone-4', c.zone4);
  style.setProperty('--zone-5', c.zone5);
  // 확장: 의미 토큰 직접 노출 (기존 var(--lime) 사용처 점진 마이그레이션용)
  style.setProperty('--color-primary', c.primary);
  style.setProperty('--color-accent', c.accent);
  style.setProperty('--color-success', c.success);
  style.setProperty('--color-warning', c.warning);
  style.setProperty('--color-error', c.error);
  style.setProperty('--color-brand-bike', c.brandBike);
  style.setProperty('--color-brand-run', c.brandRun);
  style.setProperty('--color-brand-swim', c.brandSwim);

  // --- Chart colors ---
  const ch = variant.chartColors;
  style.setProperty('--grid-soft', ch.grid);
  style.setProperty('--grid-axis', ch.gridAxis);
  style.setProperty('--chart-speed', ch.speed);
  style.setProperty('--chart-altitude', ch.altitude);
  style.setProperty('--chart-cadence', ch.cadence);
  style.setProperty('--chart-heart-rate', ch.heartRate);
  style.setProperty('--chart-power', ch.power);
  style.setProperty('--chart-grid-label', ch.gridLabel);

  // --- Dimens → index.css `--space-*`, `--r-*` 호환 + 확장 ---
  const d = theme.dimens;
  style.setProperty('--space-1', `${d.paddingXs}px`);
  style.setProperty('--space-2', `${d.paddingS}px`);
  style.setProperty('--space-3', `${d.itemInner}px`);
  style.setProperty('--space-4', `${d.paddingM}px`);
  style.setProperty('--space-6', `${d.paddingL}px`);
  style.setProperty('--space-7', `${d.paddingXl}px`);
  style.setProperty('--r-sm', `${d.cornerRadiusS}px`);
  style.setProperty('--r-md', `${d.cornerRadiusM}px`);
  style.setProperty('--r-lg', `${d.cornerRadiusL}px`);
  style.setProperty('--r-xl', `${d.cornerRadiusXl}px`);
  // 확장 — 앱 의미 토큰
  style.setProperty('--dim-item-gap', `${d.itemGap}px`);
  style.setProperty('--dim-section-gap', `${d.sectionGap}px`);
  style.setProperty('--dim-card-padding', `${d.cardPadding}px`);
  style.setProperty('--dim-button-height', `${d.buttonHeight}px`);
  style.setProperty('--dim-list-item-height', `${d.listItemHeight}px`);
  style.setProperty('--dim-icon-s', `${d.iconS}px`);
  style.setProperty('--dim-icon-m', `${d.iconM}px`);
  style.setProperty('--dim-icon-l', `${d.iconL}px`);

  // --- Typography — 데이터 위계만 CSS 변수로 (UI 텍스트는 컴포넌트에서 직접 사용) ---
  const t = theme.typography;
  style.setProperty('--fs-data-hero', `${t.dataHero.size}px`);
  style.setProperty('--fs-data-large', `${t.dataLarge.size}px`);
  style.setProperty('--fs-data-medium', `${t.dataMedium.size}px`);
  style.setProperty('--fs-data-small', `${t.dataSmall.size}px`);
  // 일반 ramp (index.css `--fs-*` 와 호환)
  style.setProperty('--fs-xs', `11px`);
  style.setProperty('--fs-sm', `12px`);
  style.setProperty('--fs-base', `${t.body.size}px`);
  style.setProperty('--fs-md', `${t.bodyMedium.size}px`);
  style.setProperty('--fs-lg', `${t.bodyLarge.size}px`);
  // xl~3xl: 앱 v3 표준(title 22sp / display) 정합 + 단조 증가 고정.
  // 과거엔 압축형 데이터 토큰(dataSmall/Medium)에서 파생해 DEFAULT 테마에서
  // 2xl(18)·3xl(18) < xl(20) 역전이 발생 → UI 헤딩 램프를 데이터 위계와 분리.
  // 실제 데이터 수치는 --fs-data-* / <Text> 데이터 variant 사용.
  style.setProperty('--fs-xl', `22px`);
  style.setProperty('--fs-2xl', `28px`);
  style.setProperty('--fs-3xl', `32px`);

  // 모든 typography 키 — `--ft-{kebab}-{size|weight}` 로도 노출
  (Object.keys(t) as Array<keyof typeof t>).forEach((key) => {
    const tk = t[key];
    const k = toKebab(key as string);
    style.setProperty(`--ft-${k}-size`, `${tk.size}px`);
    style.setProperty(`--ft-${k}-weight`, String(tk.weight));
    if (tk.lineHeight) style.setProperty(`--ft-${k}-line-height`, String(tk.lineHeight));
    if (tk.letterSpacing) style.setProperty(`--ft-${k}-letter-spacing`, tk.letterSpacing);
  });

  // 테마 식별자 — CSS 에서 attr 셀렉터 활용 가능
  document.documentElement.setAttribute('data-design-theme', theme.id);
}

export function OriderThemeProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [themeId, setThemeIdState] = useState<ThemeId>(() => readStoredId());

  const theme = THEMES[themeId] ?? DEFAULT_THEME;
  const variant: OriderThemeVariant =
    resolvedTheme === 'dark' ? theme.scheme.dark : theme.scheme.light;

  useEffect(() => {
    applyToRoot(theme, variant);
  }, [theme, variant]);

  const setThemeId = useCallback((next: ThemeId) => {
    if (!THEMES[next]) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    setThemeIdState(next);
  }, []);

  const value = useMemo<OriderThemeContextValue>(
    () => ({
      theme,
      variant,
      availableThemes: Object.values(THEMES),
      setThemeId,
    }),
    [theme, variant, setThemeId],
  );

  return <OriderThemeContext.Provider value={value}>{children}</OriderThemeContext.Provider>;
}

export function useOriderTheme(): OriderThemeContextValue {
  const ctx = useContext(OriderThemeContext);
  if (!ctx) throw new Error('useOriderTheme must be used within OriderThemeProvider');
  return ctx;
}

/** 비-React 환경 (Chart.js plugin 등) 용 — variant 만 직접 조회. */
export function readVariantFromDom(): {
  background: string;
  textPrimary: string;
  gridSoft: string;
  gridAxis: string;
} | null {
  if (typeof document === 'undefined') return null;
  const cs = getComputedStyle(document.documentElement);
  return {
    background: cs.getPropertyValue('--bg-0').trim(),
    textPrimary: cs.getPropertyValue('--ink-0').trim(),
    gridSoft: cs.getPropertyValue('--grid-soft').trim(),
    gridAxis: cs.getPropertyValue('--grid-axis').trim(),
  };
}

/** 테스트/스토리북에서 특정 테마+variant 강제 적용 시 사용. */
export function _testApplyTheme(theme: OriderTheme, resolved: ResolvedTheme) {
  applyToRoot(theme, resolved === 'dark' ? theme.scheme.dark : theme.scheme.light);
}
