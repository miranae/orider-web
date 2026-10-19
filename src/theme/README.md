# 디자인 시스템 (Web)

실물 React 카탈로그: [디자인 시스템 컨트롤](/design-system-controls.html) · [소스](../dev/designSystemControls.tsx) · [컴포넌트 사용 가이드](components/README.md).

앱(KMP `shared/theme`) 의 토큰·테마 인터페이스·런타임 교체 구조를 웹에 포팅한 모듈.

이 manifest는 #372 Phase 1의 **웹 canonical/export contract**다. 현재 생성 대상은
웹 TypeScript/CSS뿐이며, KMP `Orider*Tokens.kt`는 아직 앱 저장소가 소유한다.
따라서 이 단계만으로 앱↔웹 단일 진실원이 완성된 것은 아니다. Kotlin 생성 경로와
cross-repo 배포/버전 계약은 후속 작업으로 남겨 둔다.

## 시각 기준 — Apple HIG + ORider 브랜드

웹 공통 컴포넌트는 [Apple Human Interface Guidelines](https://developer.apple.com/kr/design/human-interface-guidelines/)를 기본으로 삼고, 강조색에는 ORider 브랜드 컬러를 적용한다. 원칙만 인용하는 수준을 넘어 서체, 버튼 형태, 선택 면, 중립 표면과 간격을 같은 기준으로 맞춘다. 네이티브 플랫폼 구현이나 Apple 인증을 뜻하지 않는다.

- 서체는 Apple 시스템 서체를 우선하는 시스템 스택을 사용한다. 다른 운영체제에서는 해당 시스템 서체로 대체하며 Apple 폰트 파일을 배포하지 않는다.
- 주요 행동은 채운 버튼, 보조 행동은 절제된 색 면, 낮은 위계 도구는 plain 표현으로 구별한다. 인접한 대안의 크기를 달리해 위계를 만들지 않는다.
- 단일 선택은 일관된 선택 면의 segmented control, 다중 지표 선택은 체크가 있는 토글, 즉시 실행 명령은 툴바로 구분한다.
- 지도 카메라는 한 조작 면에 묶고, 지도 영역 확대는 좌상단·우하단 `//`로 제공한다. 차트의 데이터와 읽기 영역보다 조작부가 강하게 보이지 않도록 한다.
- 색만으로 상태를 표현하지 않고, 누름·포커스·비활성·처리 중 상태를 공통 구현한다. 작은 화면에서도 조작 영역과 긴 레이블을 확보한다.
- 차트는 데이터 선을 우선하고 축·단위·범위·고정 값 표가 해석을 돕게 한다. 서로 다른 단위는 정렬된 레인으로 나눈다.

구체적인 선택·조합과 상태는 [실물 카탈로그](/design-system-controls.html), 컴포넌트 API는 [사용 가이드](components/README.md)가 정본이다. 새 화면에서 개별적인 버튼·지도·차트 표현을 다시 만들지 않는다.

## 레이어

```
../../design-tokens/orider.tokens.json — 웹 런타임 값의 단일 진실원
generated.ts/css — manifest에서 생성된 TS 값·Provider 매핑·FOUC CSS
tokens/        — 공개 타입과 수동 typography/app-parity 확장
OriderTheme.ts — 테마 인터페이스 (id, label, scheme.light/dark, dimens, typography)
themes/        — 구현체
  defaultTheme.ts   — generated scheme을 기존 OriderTheme API로 노출
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

- 기본 테마 값은 `design-tokens/orider.tokens.json`에서만 수정하고
  `npm run gen:design-tokens`을 실행. `generated.css`가 React mount 전 FOUC 기본값을 제공한다.
- `npm run check:design-tokens`은 산출물이 manifest와 다르면 실패한다.
- 지도 트랙/계획 경로 색은 브랜드 accent와 별개인 `functionalColors.map`에서 관리한다.
- Chart.js 등 비-React 코드: `readVariantFromDom()` 또는 `getComputedStyle(document.documentElement)` 로 조회.

## 지도·차트 표현 소유권

지도 크기/위치 컨트롤, 차트 툴바·토글·레인·범위 캡션·두 줄 값은
`src/theme/components`의 공통 프리미티브를 사용한다. 컴포넌트 API와 마이그레이션 예는
[components/README.md](components/README.md#지도차트-컨트롤)에 있다.

Canvas 선 표현과 표시 밀도 상수는 React에 의존하지 않는
`src/theme/charts/chartPresentation.ts`가 소유한다. 기능 페이지는 원본 데이터·권한·시계·축 domain·
관측 평균·지도 카메라를 계속 소유하고, 화면 CSS에서 DS 내부 선택자를 덮어쓰지 않는다.

## 카드·섹션·표·복합 차트의 역할

- `Section`은 하나의 주제와 제목·설명·동작을 연결한다. 섹션 전체를 다시 카드로 감싸지 않고, 정렬과 주제 간격으로 큰 흐름을 드러낸다.
- `Card`는 관련 내용에 별도 표면이 필요한 경우 사용한다. 내부의 하위 관계는 여백과 정렬로 표현하고 카드를 중첩하지 않는다. `default`·`flat`·`inset`·`bare`의 선택과 실제 조합은 카탈로그를 따른다.
- `DataTable`은 정확한 수치 비교를 맡는다. 열 이름·단위, 숫자 정렬, 0과 미수신의 구분, 정렬 상태, 로딩과 빈 상태를 보존한다. 좁은 화면에서는 정보를 생략하지 않고 표 영역 안에서 가로로 탐색한다.
- `ComboChart`는 같은 시간축에서 다른 종류의 표시를 조합한다. 막대와 선, 각 단위 축과 범례를 명시하고 축은 최대 두 개로 제한한다. 서로 다른 단위의 높이를 직접 비교하거나 인과관계를 뜻하는 설명을 붙이지 않는다. 정확한 선택값은 고정된 읽기 영역에 남긴다. 여러 사람의 동일 지표를 비교할 때는 `ComparisonChart`를 사용한다.

참고: Apple HIG [Boxes](https://developer.apple.com/design/human-interface-guidelines/boxes), [Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables), [Charts](https://developer.apple.com/design/human-interface-guidelines/charts).
