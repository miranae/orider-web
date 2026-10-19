# 디자인 시스템 컴포넌트 (마이그레이션 가이드)

`src/theme/` 가 단일 디자인 시스템. 앱(KMP) 의 `OriderTheme` 패턴 — 토큰을 컴포넌트가 내부에서만 소비, 사용처에서 색/사이즈 직접 지정 불가.

실제 React 컴포넌트 카탈로그: [디자인 시스템 컨트롤](/design-system-controls.html) · [카탈로그 소스](../../dev/designSystemControls.tsx). 새 사용 예는 이 정본에 추가한다.

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
    ├── Chart.tsx              ChartFrame / Header / Legend / Tooltip / Grid·Axis
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

## 버튼 선택 기준

| variant | 사용할 때 |
|---|---|
| `primary` | 화면의 주요 확정·제출 행동 |
| `secondary` | 주요 행동을 보조하는 일반 행동 |
| `ghost` | 낮은 위계의 도구·탐색 행동 |
| `outline` | 외곽선으로 구분·강조할 행동 |
| `danger` | 삭제처럼 파괴적인 행동 |

선택된 지표·축 상태는 `ToggleButton selected`로 표현한다. 연속된 도구 묶음은
`ControlToolbar` 안의 `ToolbarButton`을 사용한다. 선택 상태나 툴바 모양을 만들기 위해
페이지에서 `Button`의 색·테두리·크기를 덮어쓰지 않는다.

## Link 등 비-button 요소 (router 호환)

`<button>` 가 아닌 요소에 버튼 스타일을 입혀야 할 때 (React Router `<Link>` 등):

```tsx
import { buttonClass } from '@/theme';

<Link to="/event/create" className={buttonClass({ variant: 'primary', size: 'sm' })}>
  새 이벤트
</Link>
```

직접 className 조립이 아니라 `buttonClass()` 호출이므로 lint 통과 + 토큰 일관성 유지.

## 상태·피드백 규칙

- 폼 검증 실패는 `Input`, `Textarea`, `Select`의 `invalid` prop을 사용한다. 컴포넌트가 `aria-invalid=true`를 함께 연결한다.
- 제출·저장처럼 중복 실행되면 안 되는 액션은 `disabled`만 두지 말고 `Button loading` 또는 `IconButton loading`을 사용한다.
- 로딩 피드백은 레이아웃을 유지해야 하면 `LoadingSkeleton`, 짧은 인라인 대기는 버튼 스피너를 쓴다.
- 스켈레톤 높이가 실제 콘텐츠와 다르면 `minHeight`를 넘겨 로드 완료 시 레이아웃 이동을 줄인다.
- 에러 토스트는 성공/정보보다 길게 유지되며 닫기 버튼을 제공한다. 사용자가 반드시 읽어야 하는 오류는 토스트만 쓰지 말고 화면 내 `ErrorState`도 함께 둔다.
- 클릭 가능한 `Card`와 `Chip`은 직접 role/tabIndex를 붙이지 않아도 `onClick` 또는 `selectable` prop으로 키보드 실행이 보강된다.

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

차트는 `ChartFrame` 안에 `ChartHeader`, `ChartLegend`, `ChartTooltip`을 조합하고 SVG 격자는 `ChartGridLine`, 기준축은 `ChartAxisLine`을 사용한다. 데이터 path와 상호작용은 기능 컴포넌트가 소유한다.

1. `src/theme/components/{Name}.tsx` — 토큰만 소비
2. `components.css` 에 `ds-{name}` 스타일 (모든 색·치수는 `var(--*)` 만)
3. `components/index.ts` 에 export
4. `{Name}.test.tsx` 에 variant/prop 케이스 추가
5. 실물 React 카탈로그 [`/design-system-controls.html`](/design-system-controls.html)의 정본 [src/dev/designSystemControls.tsx](../../dev/designSystemControls.tsx)에 사용 예 추가

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

## 지도·차트 컨트롤

표현의 정본은 `ControlToolbar.tsx`, `ToggleControls.tsx`, `MapControls.tsx`,
`Chart.tsx`와 `components.css`다. 페이지에서 `.ds-btn`/`.ds-chart*`를 덮어쓰거나
버튼에 색·높이·폰트를 직접 주지 않는다. 기존 `Button`의 5개 variant·3개 size는 그대로다.

```tsx
import {
  ControlToolbar, ToolbarGroup, ToolbarButton,
  ToggleControls, ToggleButton, MapResizeControls, MapNavigation, MapControlButton,
  ChartLane, ChartPlot, ChartRangeCaption, ChartValue,
} from '@/theme/components';

<ControlToolbar aria-label="차트 구간">
  <ToolbarGroup>
    <ToolbarButton iconOnly aria-label="확대" onClick={zoomIn}>+</ToolbarButton>
    <ToolbarButton iconOnly aria-label="축소" disabled={atFullRange} onClick={zoomOut}>−</ToolbarButton>
  </ToolbarGroup>
  <ToolbarButton aria-pressed={selecting} onClick={toggleSelection}>구간 선택</ToolbarButton>
</ControlToolbar>
<ToggleControls variant="metric" aria-label="표시 지표">
  <ToggleButton selected={powerVisible} showCheck onClick={togglePower}>파워</ToggleButton>
</ToggleControls>
<MapResizeControls expanded={expanded} controlsId={mapId}
  expandLabel="지도 크게 보기" collapseLabel="지도 기본 크기로 보기" onToggle={toggleSize} />
<MapNavigation aria-label="지도 위치">
  <MapControlButton iconOnly aria-label="전체 경로" onClick={fitRoute}>↗</MapControlButton>
</MapNavigation>
<ChartLane title="파워" unit="W" aria-label="파워 차트">
  <ChartPlot gesture={selecting ? 'none' : 'pan-y'} empty={noSamples ? '표본 없음' : undefined}>
    {canvas}
  </ChartPlot>
</ChartLane>
<ChartRangeCaption>{visibleRangeLabel}</ChartRangeCaption>
<ChartValue primary={instantValue ?? '—'} secondary={`평균 ${observedMean ?? '—'}`} />
```

- `ToolbarButton`은 ghost 기반 독립 44px 타깃이다. `ToolbarGroup separator`는 기본값이 `true`다.
  `disabled`, `aria-pressed`, ref·native 이벤트를 그대로 전달한다.
- `ToggleControls variant="metric"`은 44px 체크 토글, `variant="axis"`는 하나의 중립 배경 위에 선택된 면을 올려 보이며
  모든 항목에 실제 44px 이상 타깃을 제공한다. `ToggleButton`은 `selected`를 자동 변경하지 않는다.
  단일 선택/복수 선택 여부와 상태 전이는 호출자가 결정한다. `ToggleNote`는 선택 행의 보조 설명이다.
- `ToolbarButton`·`ToggleButton`·`MapControlButton`은 `className`, `style`, `variant`, `size`, `dense`를
  외부 API에서 제외한다. 레이아웃이 필요한 경우 부모 wrapper를 사용한다.
- `MapResizeControls`는 좌상단·우하단의 같은 `//` 액션을 제공한다. 지도 영역 높이와 카메라 상태는
  포함하지 않는다. `MapControlButton`은 `aria-label` 필수이며 기본 title도 그 이름을 쓴다.
  `MapNavigation`은 기본 우상단 세로 배치이며 `orientation="horizontal"`도 지원한다.
- `ChartHeader size="compact"`는 시스템 글꼴의 subtitle 위계, `ChartLegend marker="dot"`는 기록별 색 점 범례다.
  기본 헤더와 선 범례의 기존 호출은 바뀌지 않는다.
- `ChartLane subdued`는 배경 레인의 낮은 위계, `ChartPlot tone="background"`는 72px 높이다.
  기본 metric plot은 144px다. 높이·색은 DS가 소유하고 `gesture`만 입력 정책을 전달한다.
  plot ref·pointer handler·canvas는 그대로 유지하며 빈 데이터 판정은 호출자가 한다.
- `ChartRangeCaption`은 기본 `aria-live="polite"`다. 커서 이동마다 값을 넣지 말고 viewport 변경만 알린다.
  `ChartValue`는 주 값과 작은 회색 보조값만 배치하며 단위 변환·평균 계산을 하지 않는다.

### Canvas·표시 밀도 계약

순수 정본은 `src/theme/charts/chartPresentation.ts`이며 component barrel에서도 재노출한다.
React 없는 표시 알고리즘은 순수 정본을 직접 import한다.

| 상수 | 계약 |
|---|---|
| `CHART_PRESENTATION` | metric 144px / background 72px / y축 54px / 선 opacity .8 / 배경선 .18 / 파워·속도 tension 0 / fill 없음 |
| `CHART_PRESENTATION_DENSITY` | 9px당 1점 목표 / conservative 최대 240점 / 최소 4점 / 경계 교점 2개 예약 / 폭 변화 7px 이상 재집계 |

표시 평균은 공통 bin의 **표본 산술평균**이다. 시각·거리 축, 원본 domain, 유효 표본·공백 판단,
선택 지점의 원본 순간값, 관측 시간으로 가중한 표 평균, 지도 카메라·범위 연동은 기능 계층의 책임이다.
범위가 충분히 좁으면 원본 상세로 돌아가며, 결측·역행·단절을 넘어 연결하거나 실제 0을 누락으로 바꾸지 않는다.

### 툴팁과 고정 비교 영역

용어 설명은 홈 화면과 같은 `InfoTip`을 사용한다. 트리거는 accent 색만 쓰며 밑줄·점선으로
장식하지 않는다. `ChartTooltip`은 기존 `pointer-events: none`인 임시 비대화형 설명 용도다.
스크롤·클릭하거나 계속 읽어야 하는 수치 비교에는 사용하지 않는다. 선택 수치는 고정 표 안의
`ChartValue`로 유지하고, pointerleave만으로 비교 영역을 unmount하지 않는다.

현재 밀도 정책(9px / conservative 최대240점)은 파워·속도 선에만 적용한다. 심박수는 원본 흐름을 유지한다.
같이한 활동의 파워·속도는 lane의 `samplingPolicy="preserve-runs"`를 명시한다. 같은 bin에
결측이 섞여도 정상 연속 구간의 평균을 남기며, 실제 공백은 연결하지 않는다. 한 bin 안의 짧은
연속 구간은 실제 시작·끝 좌표를 남긴다. 이 모드의 240은 평균 bin 예산이며, 경계와 짧은 구간
표시용 구조점은 별도다(상한 binCount + 3 × runCount + 양끝 교점 2). 정상 단조 좌표 입력에서는 원본 가시점과 필요한 경계 교점(최대2) 이하다. 유효하지 않은
좌표나 역행 입력에는 기존 단절 경계점이 추가된다. 총점 hard240을 보장하는 모드로 설명하지 않는다. 다른 소비자의
기본 `conservative` 동작은 유지한다.
차트의 구간별 표본 산술평균, 선택 지점의 원본 순간값, 표의 회색 관측 시간 가중 평균은 서로
다른 값이므로 화면의 짧은 안내와 `InfoTip`에서 그 차이를 설명한다.


### 소유권 검사와 기존 예외

[저장소 규칙](../../../AGENTS.md)의 버튼·지도·차트 소유권 규칙을 따른다.
[`scripts/check-design-system-ownership.mjs`](../../../scripts/check-design-system-ownership.mjs)는
DS 밖 CSS에서 `.ds-btn`, `.ds-chart*`, `.ds-toolbar*`, `.ds-map*`, `.ds-toggle*`, `.ds-control*`, `.ds-section*`, `.ds-data-table*`, `.ds-combo-chart*`, `.ds-segment-timeline*`, `.ds-reference-gauge*`, `.ds-before-after*`를
명시한 선택자의 신규·변경된 스타일 재정의를 검사하며 `npm run quality:budget`에 포함된다.
인라인 스타일, 간접 선택자 등 모든 우회를 자동으로 보장하는 검사는 아니므로 코드 검수에서도
공통 프리미티브의 표현 소유권을 확인한다.

기존 타 화면의 126개 규칙은 [동결 baseline](../../../scripts/design-system-ownership-baseline.json)에
기록된 기존 예외다. 이는 새 페이지 스타일을 허용하는 목록이 아니며, 검사 실패를 통과시키려고
규칙을 추가하거나 baseline을 확장하지 않는다. 새 표현은 DS의 의미 있는 prop·variant와 실물
카탈로그에 반영하고 소비자는 해당 API를 사용한다.


### 공통 비교 차트 렌더러

`ComparisonChart`는 실제 동호회 화면과 실물 카탈로그가 공유하는 같은 Canvas 렌더러다.
제품 adapter는 검증된 시간·거리 좌표, null 공백, 유효 domain을 준비한다. 카탈로그는 명시된
fixture 좌표를 준비하며 별도 가짜 SVG 차트를 그리지 않는다.

- `lanes`: `{ id, label, unit, series, subdued?, beginAtZero?, sampled?, tension? }` 배열.
  `series`는 `{ id, label, color, points, borderDash? }`이며 `points`는 읽기 전용 `{ x, y: number|null }`다.
  색은 Canvas에 유효한 실제 색 값이어야 한다. 파워·속도는 `sampled: true`, `tension: 0`을 쓴다.
- `domain`, `minSpan`, `axisKey`는 원본 전체 범위·최소 확대 폭·축 식별자다. 축이 바뀌면 확대를
  복원한다. 같은 축에서 기록을 숨기면 남은 domain 안으로 현재 범위를 제한한다.
- `colors`는 `ChartColorTokens`의 `grid`, `gridAxis`, `gridLabel`이다. 앱은 theme context에서,
  카탈로그는 같은 테마의 미리보기 variant에서 전달하며 렌더러 자체는 provider를 요구하지 않는다.
- `formatTick?`, `rangeLabel(start,end)`, `labels`로 지역화한다. labels 키는
  `controls`, `zoomIn`, `zoomOut`, `selectRange`, `selectRangeShort`, `reset`, `rangeHint`, `empty`다.
  `description?`은 표본 평균 설명 같은 공통 도움말 슬롯이다.
- `selectedCoordinate`, `onHoverCoordinate`, `onViewportChange(range,fullRange)`는 실제 공통 x좌표를 쓴다.
  null viewport는 전체 범위이며 키보드 원본 표본 선택·고정 비교 표·지도 연결은 소비자가 계속 소유한다.
- 렌더러는 공통 축·커서, 명시적 드래그 확대, 44px 확대/복원 버튼, 폭별 표시 집계와 결측 상태를
  함께 제공한다. 커서 이동은 재집계·재파싱하지 않고 그리기만 갱신한다. 페이지 스크롤 휠을 가로채지 않는다.

기본 서체는 `--font-sans`의 Apple 시스템 글꼴 우선 스택, 수치는 `--font-mono`의 시스템 monospace다.
실제 SF 글꼴 파일을 배포하지 않는다. 단일 선택은 공통 선택 면으로, 복수 지표는 체크 표시로,
동작은 툴바로 구분한다. 배경 데이터 선의 alpha만 낮추고 축·단위·제목의 읽기 대비는 유지한다.

비교 기록의 색은 `theme/charts/comparisonSeriesColors.ts`의 `getComparisonSeriesColors(mode)`를
사용한다. 정본은 manifest의 `--chart-series-1..8` 라이트·다크 팔레트다. 같은 기록 index의
색을 지도·범례·표·차트에 공유하며, 주요 선은 alpha .8 합성 후 실제 중립 배경 대비 3:1 이상을
검사한다. 배경 고도·숨긴 구간의 낮은 alpha는 보조 표현이며 주요 데이터 선 기준과 구분한다.


## 카드·섹션·표·혼합 차트 예제

`Section`은 제목·설명·행동으로 콘텐츠 계층을 만든다. `headingLevel`(2/3/4)은 실제 문서 계층과 시각 위계를 함께 결정한다.
2는 title, 3은 subtitle, 4는 body-medium 토큰을 사용한다. 바깥을 장식하는 Card로 Section 전체를 다시 감싸지 않는다. 독립된 묶음에 표면이
필요하면 Card를 사용한다. `default`는 기본 표면, `flat`은 조용한 배경 묶음, `inset`은 안쪽
보조 정보, `bare`는 기본 표면·테두리를 유지한 채 padding만 0으로 만든 프레임이다.
`bare`를 투명하거나 표면이 없는 컨테이너로 해석하지 않는다. edge-to-edge 콘텐츠와 자식이 소유한
캡션 여백을 배치할 때 사용하며, 카드를 연속 중첩하지 않는다.

`DataTable<Row>`는 native caption·thead·tbody·scope를 유지한다. `columns`의
`{ id, header, cell, align?, rowHeader?, sortDirection? }`, `rows`, `rowKey`, `caption`을 전달한다.
수치는 `align="end"`, 이름은 `rowHeader: true`로 명시하고 실제 0과 결측(—)을 구분한다.
첫 열은 기본 sticky이며 좁은 폭에서는 표 내부의 명명된 region만 가로 스크롤한다.
`loading`/`loadingLabel`/`emptyLabel`은 native caption·열 제목을 유지하고, 가로로 긴 표의
바깥에서 현재 보이는 프레임 폭에 맞춰 상태를 표시한다. 상태는 표의 접근성 설명과 연결한다. 정렬은 소비자가 원본
row 순서를 실제로 변경하고 해당 열의 `sortDirection`(`ascending`/`descending`/`none`)을 제공한다.
표 헤더의 정렬 행동은 공통 Button을 사용한다. DS에 별도 정렬·페이지네이션 프레임워크를 넣지 않는다.

`ComboChart`는 같은 x축의 막대와 선을 **한 Canvas**에 그린다. 기존 `ComparisonChart`의
동일 지표·여러 기록 비교와 용도가 다르다. 파워 막대와 심박수 선처럼 다른 지표 두 개를 쓸 때는
`axes.left/right`의 명시적인 `label`·`unit`과 `series[].axis`를 연결한다. 양쪽 y축의 단위와
범위가 다르므로 선 높이를 직접 비교하거나 인과관계를 주장하지 않는다. 예제는 fixture임을 표시한다.

- `series`는 `{ id, label, color, mark:'bar'|'line', axis:'left'|'right', points }` 배열이다.
  좌표는 준비된 `{x,y:number|null}`이며 결측·공백의 null을 유지한다. 선은 fill 없이 tension 0,
  막대는 실제 0을 그대로 받는다. 시각·거리 변환이나 원본 평균 계산은 소비자가 소유한다.
- `domain`, `xLabel`, `formatX?`, `colors`로 범위·단위·공통 테마를 제공한다.
  `axes`는 최대 두 축이며 각 축의 `beginAtZero?`도 명시할 수 있다.
- `visibleSeries`, `onToggleSeries`는 제어된 범례 상태다. 범례는 막대/선 모양과 이름·단위를
  색과 함께 표시한다. 색은 해당 혼합 차트의 **지표**를 뜻하며 기록별 비교 차트의 색 의미와 구분한다.
- `selectedCoordinate`, `onSelectCoordinate`로 원본 공통 x좌표를 선택한다. 포인터·터치·방향키·
  Home/End/Escape를 제공한다. 표본을 만들지 않고 유한한 원본 x좌표를 탐색한다. 기존 좌표의 결측값도 선택해 —로 읽을 수 있다.
- `labels`는 `chart`, `legend`, `empty`, `keyboardHint`다. 선택 값은 차트 밖 고정
  DataTable/ChartValue에 표시한다. 포인터가 밖으로 나가도 선택 값 영역을 제거하지 않는다.
- Chart.js 등록은 실제 ComboChart 렌더 시 한 번만 수행한다. Button만 쓰는 페이지를 위해
  barrel import 시점에 혼합 차트 엔진을 등록하지 않는다. 선택 커서는 재파싱 없이 draw만 갱신한다.


## 준비된 분석 데이터의 공통 표현

`Section.headingId`는 문서 내 탐색에 필요한 고정 제목 anchor를 지정한다. 지정하지 않으면
자동 고유 id를 만들며, section의 접근성 이름과 실제 제목을 연결한다.

- `SegmentTimeline`은 `rows[{id,label,buckets[{id,label,weight,segments[{weight,color?}]}]}]`를
  받아 준비된 가중치 비율을 그린다. 시간 정렬·존 판정·지속시간 계산은 adapter의 책임이다.
  bucket의 `label`에 구간·존 구성·결측 의미를 담아 색만으로 정보를 전달하지 않는다. null 색은
  결측 표현이고 0 가중치는 보존한다. 전체 이름은 `aria-label`, 추가 안내는 `accessibleHint`다. 전체 timeline 하나만 Tab 초점을 받으며
  좌우/Home/End와 구간 클릭·탭으로 인접한 고정 readout을 갱신한다. 포인터가 떠나도 선택 내용은 유지한다.
- `ReferenceGauge`는 `value`, `domain`, `bands[{from,to,color?,active?}]`,
  `ticks[{value,label,compact?}]`, 선택적 `reference:{value,label}`와 `outsideLabel`을 받는다.
  읽기 전용 `role="img"`이며 편집 가능한 slider가 아니다. `aria-label`에 실제 값·단위·기준을
  제공한다. 범위 밖 값은 위치만 끝에 제한하며 실제 값은 바꾸지 않는다. 유효하지 않은 값이나
  domain에는 marker를 그리지 않고 결측을 0으로 만들지 않는다. 좁은 폭에서는 compact 눈금
  문구만 남기되 모든 눈금 위치는 유지한다.
- `BeforeAfterPlot`은 `rows[{id,label,ariaLabel,from,to,values,shadeBelowReference?}]`,
  공통 `domain`, 선택적 `reference`, `beforeLabel`/`afterLabel`을 받는다. 같은 단위의 준비된
  전·후 값만 공유 축에 배치하며 변화량·평가·범위 여백은 계산하지 않는다. 각 행 `ariaLabel`에
  실제 전·후 값을 제공하고 `values`에 읽을 수 있는 숫자를 유지한다. 빈 원/채운 원으로 색 외의
  구분을 제공하고 점이 가까우면 halo로 두 값의 존재를 보존한다. 입력 컨트롤은 제공하지 않는다.

세 primitive는 표현과 generic geometry만 소유한다. 권한·서비스 상태·원본 표본·단위 변환·
IF/FTP·fitness·zone 계산은 feature adapter에 남긴다. 메타데이터는 기존 Card/Chip/Text/Stack을
조합하며 도움말은 홈 기준 InfoTip의 accent 색만 사용하는 규칙을 유지한다.


### 은은한 컨트롤 표면

버튼의 filled/tinted/outline 표면과 선택된 toggle·toolbar, 지도 제어 묶음은 같은 정본
`--control-sheen-*`·`--control-edge-highlight`·`--control-depth-shadow` 토큰으로 약한 수직
명암과 안쪽 edge를 공유한다. Apple에서 영감을 받은 웹 표현이며 native Liquid Glass의 재현을
뜻하지 않는다. 일반 plain 버튼은 투명한 위계를 유지하고 disabled에서는 sheen·그림자를 끈다.
pressed는 안쪽 명암으로 반응하며 focus outline·접근성 이름·터치 크기는 유지한다.

`SegmentTimeline` row의 선택적 `surface: 'sheen'`은 각 유효 segment **내부**에만 같은 존색의
명암을 더한다. 파워 존 adapter가 사용하며 기본값은 plain이다. 결측은 sheen을 적용하지 않고,
존 경계·범례 색·숫자·가중치·폭은 바꾸거나 존 사이를 보간하지 않는다.

실제 활동의 통합 파워 존 표 막대·ZoneTimeBar, 구간 분석 파워 존과 fallback ZoneDistributionChart도
`theme/charts/zoneSurface.ts`의 같은 표면 표현을 opt-in한다. Canvas는 기존 막대 내부에 토큰
명암만 합성하며 기존 data·색·범례를 변경하지 않는다. 심박 존은 자동 적용하지 않는다.

기본(default)·앱 패리티 테마의 일반 크기 버튼 텍스트는 sheen·hover·pressed 합성 후에도 4.5:1 대비를
유지하도록 채움 배경과
텍스트를 control 전용 토큰으로 분리한다. `--control-primary-fill`·`--control-danger-fill`은
밝은 모드에서 현재 `--accent`/`--color-error`와 black을 sRGB로 혼합한 더 진한 배경이며,
어두운 모드에서는 현재 테마의 기존 색을 그대로 참조한다. 특정 테마의 teal을 다른 테마에 강제하지 않는다.
`--control-accent-text`는 secondary/outline의 tinted hover까지 고려한 텍스트다. 전역 accent·
오류색·존색은 바꾸지 않는다. 새 테마는 해당 accent/error/foreground 조합으로 별도 대비 검증한다.
`--control-danger-fg`는 어두운 모드에서 현재 foreground에 black을 혼합해 위험 버튼의
브랜드 배경을 유지하면서 텍스트 대비를 확보한다.
disabled의 약한 대비는 실행 불가 상태에만 사용한다.

DataTable의 `rowHeaderWidth="compact"`는 짧은 기록명과 많은 지표를 나란히 비교할 때 이름 열을
desktop 224px(token 조합)로 제한한다. 기본값은 기존 28%이며 좁은 폭의 sticky 열 112px는
두 옵션 모두 유지한다. 주변 Section에 시각 제목이 이미 있으면 `captionVisibility="screen-reader"`로
caption의 반복만 숨길 수 있다. native caption과 표·가로 스크롤 region의 접근성 이름은 유지한다.

`SeriesLabel color={recordColor}`는 텍스트 잉크를 유지한 채 이름 밑줄로 기록 색을 표현한다.
선택 컨트롤·활동 링크·범례에서 같은 이름 표시를 재사용한다. `ChartLegend marker="underline"`은
같은 primitive를 사용하며, 기존 line/dot 기본 표현은 바꾸지 않는다. 밑줄 자체는 클릭 의미가
아니며 선택 상태와 navigation 의미는 각각 ToggleButton과 Link가 계속 제공한다.

ComparisonChart lane의 `lineWeight="readable"`은 주요 선을 공통
`CHART_PRESENTATION.readableLineWidth`(2px)로 표시하는 opt-in이다. 기본 두께 1.5px와
배경 고도 1px/.18은 유지한다. 같이한 활동의 분리된 지표 lane은 이 옵션과 실선을 사용하며,
다른 소비자의 기본 두께·기존 dash 의미는 변경하지 않는다.

`Checkbox`는 native checkbox 상태·Space 키 동작과 44px label 클릭 영역을 제공한다.
접근성 이름은 필수이며 옆의 navigation 링크는 label 밖에 둔다. DataTable의
`rowHeaderWidth="selectable"`은 앞 선택칸을 둔 이름 열에 desktop224px/mobile144px를 사용한다.
ComparisonChart의 선택적 `beforePlot` 슬롯은 toolbar·범위·설명 뒤, 첫 lane 바로 앞에
범례 같은 prepared presentation을 배치한다. 데이터 개수나 계산은 변경하지 않는다.

Checkbox의 선택적 `color`는 준비된 기록 색을 native `accent-color`로 연결한다. 생략하면
기존 공통 accent가 유지된다. 같이한 활동은 표 checkbox와 범례 dot으로 기록을 구분하고
상단 선택과 활동 링크의 이름은 일반 잉크로 유지한다. `ChartLegend align="end"`는
범례를 오른쪽 정렬하는 opt-in이며 기본 정렬은 바꾸지 않는다.
