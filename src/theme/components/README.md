# 디자인 시스템 컴포넌트 (마이그레이션 가이드)

`src/theme/` 가 단일 디자인 시스템. 앱(KMP) 의 `OriderTheme` 패턴 — 토큰을 컴포넌트가 내부에서만 소비, 사용처에서 색/사이즈 직접 지정 불가.

## 레이어

```
src/theme/
├── tokens/                    토큰 인터페이스 (colors / dimens / typography)
├── themes/                    DEFAULT_THEME / APP_PARITY_THEME
├── OriderTheme.ts             테마 인터페이스
├── OriderThemeProvider.tsx    <html> CSS 변수 주입
└── components/                ← 여기. 모든 UI 프리미티브
    ├── Button.tsx             5 variant × 3 size × loading / icon / block
    ├── Card.tsx               default/flat/inset/bare
    ├── Chip.tsx               default/accent/success/warning/danger
    ├── Input.tsx              Input / Textarea / Select / Field
    ├── Switch.tsx             토큰 색 + 18px 슬라이더
    ├── Stack.tsx              inline `display:flex; gap` 대체
    ├── Stat.tsx               라벨 + 큰 수치 + 단위 + 변화량
    ├── Alert.tsx              info/success/warning/danger + 기본 아이콘
    ├── Progress.tsx           0..1 / 0..100 자동 + variant
    └── components.css         모든 ds-* 스타일 (외부 import 금지)
```

## 사용 예

```tsx
import { Button, Card, Stat, Stack, Chip, Text } from '@/theme';
// 또는: import { Button } from '@/theme/components';

<Card title="이번 주" sub="WEEK 21">
  <Stack gap="var(--dim-section-gap)">
    <Stat
      label="총 거리"
      value={235}
      unit="km"
      delta={{ value: '+18%', direction: 'up' }}
    />
    <Stack direction="row" gap={8}>
      <Chip variant="accent" dot>연결됨</Chip>
      <Button variant="primary">상세 보기</Button>
    </Stack>
  </Stack>
</Card>
```

## Link 등 비-button 요소 (router 호환)

`<button>` 가 아닌 요소에 버튼 스타일을 입혀야 할 때 (React Router `<Link>` 등):

```tsx
import { buttonClass } from '@/theme';

<Link to="/event/create" className={buttonClass({ variant: 'primary', size: 'sm' })}>
  새 이벤트
</Link>
```

직접 className 조립이 아니라 `buttonClass()` 호출이므로 lint 통과 + 토큰 일관성 유지.

## 마이그레이션 매핑

### 폐기됨 (rd2-*)

| 기존 | 신규 | 자동 codemod |
|---|---|---|
| `<button className="rd2-btn">` | `<Button variant="secondary">` | ✅ `scripts/codemod-rd2-btn.mjs` |
| `<button className="rd2-btn rd2-btn--primary">` | `<Button variant="primary">` | ✅ |
| `<button className="rd2-btn rd2-btn--ghost rd2-btn--sm">` | `<Button variant="ghost" size="sm">` | ✅ |
| `<input className="rd2-input">` | `<Input>` | (수동) |

### Deprecated (rd-*, lint warn)

| 기존 | 신규 | codemod |
|---|---|---|
| `<button className="rd-btn rd-btn--primary">` | `<Button variant="primary">` | ✅ `scripts/codemod-rd.mjs` (순수 className 한정) |
| `<span className="rd-chip">` | `<Chip>` | ✅ |
| `<div className="rd-card">` | `<Card>` 또는 `<Card variant="bare">` | ❌ (padding 차이, 수동) |

> `rd-card` 는 padding 없음, `<Card>` 는 기본 padding 16px. 일괄 치환 시 레이아웃 폭증 — 사이트별 판단.

### Tailwind 우회 (codemod 처리됨)

| 기존 | 신규 | 자동 codemod |
|---|---|---|
| `className="rounded-md"` | `className="rounded-[var(--r-md)]"` | ✅ `scripts/codemod-rounded.mjs` |
| `className="rounded"` | `className="rounded-[var(--r-sm)]"` | ✅ |
| `className="text-xs"` (~800건) | `className="text-[var(--fs-xs)]"` | ✅ `scripts/codemod-tailwind-bypass.mjs` |
| `className="text-white"` | `className="text-[var(--ink-0)]"` | ✅ |
| `style={{ color: '#FC5200' }}` | `style={{ color: 'var(--accent)' }}` | ✅ (알려진 hex 매핑) |
| `<Text variant="caption">` | 신규 코드는 컴포넌트 사용 권장 | — |

## ESLint 강제

`eslint.config.js` 의 `design-system` 플러그인:

- `no-token-bypass-classname` — 위 우회 패턴을 className 안에서 발견 시 **warn**
- `no-hex-color-in-jsx-style` — JSX `style={{}}` 안 hex 발견 시 **warn**

```bash
npm run lint          # warn 만 있어도 통과
npm run lint:report   # 카운트 확인용
```

**승격 일정**: 2026-06-22 (4주 후) `warn` → `error` 승격, CI fail. 그 전까지 잔존 사용처 PR 단위로 정리.

### 잔존 lint warn (≈63건)

전면 codemod 후 남은 카테고리:

| 카테고리 | 건수 | 사유 |
|---|---:|---|
| 혼합 rd-* (template literal `${...}` 안) | 17 | `<button className={\`rd-btn ${cond ? 'x' : ''}\`}>` 패턴 — codemod 가 동적 부분 보존 어려움. 수동. |
| 특수 hex (chart-specific) | 8 | `#fff3e0`, 차트 라이브러리 직접 호출용 등 — 토큰화 가치 낮음 |
| 기존 `react-hooks/rules-of-hooks` | 16 | 디자인과 별개 진짜 버그 — 별도 PR |
| 기타 (no-empty 등) | ≈22 | TypeScript-eslint 일반 룰 |

이번 마이그레이션 효과: **1,561 → 63 warnings (-96%)**.

## 새 컴포넌트 추가 가이드

1. `src/theme/components/{Name}.tsx` — 토큰만 소비
2. `components.css` 에 `ds-{name}` 스타일 (모든 색·치수는 `var(--*)` 만)
3. `components/index.ts` 에 export
4. `{Name}.test.tsx` 에 variant/prop 케이스 추가
5. 데모 페이지(`public/design-system.html`) 에 사용 예 추가

## 안티 패턴 (절대 금지)

```tsx
// ❌ 컴포넌트 안에서 hex 직접 사용
<Button style={{ background: '#FC5200' }}>x</Button>

// ❌ 컴포넌트 prop 우회를 위해 className 직접 조립
<Button className="bg-red-500">x</Button>

// ❌ ds-* 클래스를 컴포넌트 밖에서 사용
<div className="ds-btn ds-btn--primary">x</div>

// ✅ 항상 variant prop 으로
<Button variant="danger">x</Button>
```

## 앱 (Compose) 과의 정합

| 앱 (`shared/theme/`) | 웹 (`src/theme/`) |
|---|---|
| `OriderColorTokens.kt` | `tokens/colors.ts` + `themes/*.ts` |
| `OriderTheme` 인터페이스 | `OriderTheme.ts` |
| Compose `Button(...)` (테마 자동) | `<Button variant=... />` (props) |
| `LocalOriderTheme.current.colors.accent` | `useOriderTheme().variant.colors.accent` |

대원칙 동일: **사용처에서 토큰을 만지지 않는다.**
