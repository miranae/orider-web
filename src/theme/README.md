# 디자인 시스템 (Web)

앱(KMP `shared/theme`) 의 토큰·테마 인터페이스·런타임 교체 구조를 웹에 포팅한 모듈.

## 레이어

```
tokens/        — 단일 진실원 (colors / dimens / typography)
OriderTheme.ts — 테마 인터페이스 (id, label, scheme.light/dark, dimens, typography)
themes/        — 구현체
  defaultTheme.ts   — 기존 OKLCH 라이트/다크 (현 index.css 와 등가)
  appParityTheme.ts — 앱 OLED 다크 + Strava Orange
OriderThemeProvider.tsx — Context + <html> inline CSS 변수 주입
```

## 사용

```tsx
import { useOriderTheme } from '@/theme';

function MyComp() {
  const { theme, variant, setThemeId, availableThemes } = useOriderTheme();
  return (
    <div style={{ background: variant.colors.surface, padding: theme.dimens.cardPadding }}>
      <h2 style={{ fontSize: theme.typography.title.size }}>{theme.label}</h2>
      <select value={theme.id} onChange={(e) => setThemeId(e.target.value)}>
        {availableThemes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
    </div>
  );
}
```

CSS 에서는 기존 `var(--bg-0)`, `var(--lime)` 등을 그대로 사용 — provider 가
선택된 테마/모드에 맞춰 `<html style>` 로 변수 값을 덮어쓴다.

확장 토큰:
- `--dim-card-padding`, `--dim-item-gap`, `--dim-section-gap` 등 (앱 의미 단위)
- `--ft-{kebab}-size|weight|line-height|letter-spacing` (모든 typography 키)
- `--chart-speed|altitude|cadence|heart-rate|power|grid-label`

## 새 테마 추가

1. `themes/myTheme.ts` 에 `OriderTheme` 구현체 작성 (`scheme.light` + `scheme.dark` 둘 다 필수)
2. `themes/index.ts` `THEMES` 레지스트리에 등록
3. 끝. `availableThemes` 자동 노출, 설정 UI 변경 불필요.

## 앱 (KMP) 과의 정합

| 앱 | 웹 |
|---|---|
| `OriderColorTokens.kt` | `tokens/colors.ts` (interface only) + `themes/*.ts` |
| `OriderDimensTokens.kt` | `tokens/dimens.ts` (`DEFAULT_DIMENS`, `APP_PARITY_DIMENS`) |
| `OriderTypeTokens.kt` | `tokens/typography.ts` (`DEFAULT_TYPOGRAPHY`, `APP_PARITY_TYPOGRAPHY`) |
| `OriderTheme.kt` (interface) | `OriderTheme.ts` |
| `LocalOriderTheme` (CompositionLocal) | `useOriderTheme()` (React Context) |
| `DefaultOriderTheme.kt` | `themes/defaultTheme.ts` |
| `HighContrastOriderTheme.kt` | `themes/appParityTheme.ts` (네이밍 다름 — 웹은 앱 패리티가 첫 대안) |

## 주의

- `index.css` 의 `:root` 블록은 SSR/FOUC 방지용 기본값 — provider 가 mount 후
  덮어쓰지만, JS 비활성 환경에서도 라이트 테마 default 가 보이도록 유지.
- `index.css` 토큰 변경 시 `themes/defaultTheme.ts` 도 함께 갱신.
- Chart.js 등 비-React 코드: `readVariantFromDom()` 또는 `getComputedStyle(document.documentElement)` 로 조회.
