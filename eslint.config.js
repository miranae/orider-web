// ESLint flat config — 디자인 시스템 우회 차단이 1차 목표.
//
// 룰 레벨 정책:
// - error: 절대 머지 금지 (예: rd2-* 신규 사용, 하드 hex)
// - warn:  기존 코드 점진 정리 대상 (text-xs 등 Tailwind 사이즈/색 클래스)
//
// 점진 단계:
//   현재   → warn (잔존 카운트만 노출)
//   4주 후 → error 승격 + CI fail
//
// 커스텀 룰은 별도 패키지 없이 인라인 플러그인으로 정의 (의존성 최소화).

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// ---- 차단 패턴 ----

/** Tailwind 폰트 사이즈 — 타이포 토큰(`theme.typography`) 우회. */
const SIZE_CLASSES = /\b(text-(xs|sm|base|md|lg|xl|2xl|3xl|4xl|5xl))\b/;

/** Tailwind 모서리 — `var(--r-*)` 또는 컴포넌트 prop 우회.
 *  `rounded-full` `rounded-none` `rounded-tl-*` 등 부분 모서리는 의미 고정 → 제외.
 *  bare `rounded` 는 sm 와 동일(4px) — 토큰화 권장 → 포함. */
const RADIUS_CLASSES = /\b(rounded(-(sm|md|lg|xl|2xl|3xl))?)(?![-\w\[])/;

/** Tailwind 무채색 — `--bg-*` / `--ink-*` 토큰 우회. */
const GRAY_BG_CLASSES = /\b(bg-(gray|slate|zinc|neutral|stone)-(50|100|200|300|400|500|600|700|800|900|950))\b/;
const GRAY_TEXT_CLASSES = /\b(text-(gray|slate|zinc|neutral|stone)-(50|100|200|300|400|500|600|700|800|900|950)|text-(white|black))\b/;

/** 1차 deprecated — 잔존 허용 (warn). */
const RD1_CLASSES = /\brd-(btn|card|chip)\b/;

/** 2차 deprecated — 신규 금지 (error). */
const RD2_CLASSES = /\brd2-(btn|input)(?:--\w+)?\b/;

/** 레거시 타이포 유틸 클래스 — `<Text variant="...">` 우회.
 *  Tailwind `font-mono` 등 `mono` 가 부분 매치 안 되도록 identifier-char 경계 사용. */
const LEGACY_TYPOGRAPHY = /(?<![-_a-zA-Z0-9])(num-(?:md|lg|xl)|num|eyebrow|unit|mono)(?![-_a-zA-Z0-9])/;

/** JSX 내부 hex 컬러 직지정. */
const HEX_COLOR = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/;

// ---- 인라인 플러그인 ----

const designSystem = {
  rules: {
    /**
     * className 문자열에서 토큰 우회 패턴 차단.
     *
     * 검사 대상: className="...", className={`...`}, clsx() 인수.
     */
    'no-token-bypass-classname': {
      meta: {
        type: 'problem',
        docs: { description: '디자인 토큰을 우회하는 Tailwind 사이즈/색/모서리 유틸 차단' },
        schema: [],
        messages: {
          size: '`{{cls}}` — 타이포 토큰(`<Stat>`, `theme.typography.*`) 또는 데이터 위계 CSS 변수(`--fs-*`) 사용',
          radius: '`{{cls}}` — CSS 변수(`var(--r-sm|md|lg|xl)`) 또는 컴포넌트 prop 사용',
          grayBg: '`{{cls}}` — 표면 토큰(`var(--bg-0|1|2|3|4)`) 사용',
          grayText: '`{{cls}}` — 잉크 토큰(`var(--ink-0|1|2|3|4)`) 사용',
          rd1: '`{{cls}}` — 레거시 rd-* 유틸. `<Button>/<Card>/<Chip>` 컴포넌트로 교체 권장',
          rd2: '`{{cls}}` — rd2-* 는 폐기 대상. 신규 사용 금지, `<Button>/<Input>` 사용',
          legacyTypo: '`{{cls}}` — 레거시 타이포 유틸. `<Text variant="eyebrow|dataLarge|dataMedium|num|unit|mono">` 사용',
        },
      },
      create(context) {
        const check = (node, value) => {
          if (typeof value !== 'string') return;
          const checks = [
            [SIZE_CLASSES, 'size'],
            [RADIUS_CLASSES, 'radius'],
            [GRAY_BG_CLASSES, 'grayBg'],
            [GRAY_TEXT_CLASSES, 'grayText'],
            [RD1_CLASSES, 'rd1'],
            [RD2_CLASSES, 'rd2'],
            [LEGACY_TYPOGRAPHY, 'legacyTypo'],
          ];
          for (const [re, id] of checks) {
            const m = value.match(re);
            if (m) {
              context.report({ node, messageId: id, data: { cls: m[0] } });
              return; // 첫 매치만 보고 (스팸 방지)
            }
          }
        };
        return {
          JSXAttribute(node) {
            if (node.name?.name !== 'className') return;
            const v = node.value;
            if (!v) return;
            if (v.type === 'Literal') check(v, v.value);
            else if (v.type === 'JSXExpressionContainer') {
              const expr = v.expression;
              if (expr.type === 'Literal') check(expr, expr.value);
              else if (expr.type === 'TemplateLiteral') {
                expr.quasis.forEach((q) => check(q, q.value.cooked));
              }
            }
          },
        };
      },
    },

    /**
     * JSX `style={{ padding: 16 }}` 같은 그리드-aligned 인라인 spacing 차단.
     *
     * 검사 대상: padding / margin / gap (각 변형 포함).
     * 그리드 값(4|8|12|16|20|24|32|48)만 경고 — `var(--space-N)` 토큰 사용 권장.
     * 비-그리드 값(3, 6, 10, 14 등)은 디자이너 의도적 offset 가능성 → 허용.
     */
    'no-inline-px-spacing': {
      meta: {
        type: 'problem',
        docs: { description: 'JSX style 안 그리드 px spacing → `var(--space-N)` 토큰 사용' },
        schema: [],
        messages: {
          space: '`{{key}}: {{val}}` — `var(--space-{{tok}})` 토큰 사용 (8pt grid)',
        },
      },
      create(context) {
        const SPACING_KEYS = new Set([
          'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingInline', 'paddingBlock',
          'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginInline', 'marginBlock',
          'gap', 'rowGap', 'columnGap',
        ]);
        const GRID = { 4: 1, 8: 2, 12: 3, 16: 4, 20: 5, 24: 6, 32: 7, 48: 8 };

        return {
          JSXAttribute(node) {
            if (node.name?.name !== 'style') return;
            const v = node.value;
            if (!v || v.type !== 'JSXExpressionContainer') return;
            const expr = v.expression;
            if (expr.type !== 'ObjectExpression') return;
            for (const prop of expr.properties) {
              if (prop.type !== 'Property') continue;
              const keyName = prop.key.type === 'Identifier' ? prop.key.name
                : prop.key.type === 'Literal' ? prop.key.value : null;
              if (!keyName || !SPACING_KEYS.has(keyName)) continue;
              // value 검사: 숫자 리터럴 또는 'Npx' 문자열
              const val = prop.value;
              let num = null;
              if (val.type === 'Literal' && typeof val.value === 'number') {
                num = val.value;
              } else if (val.type === 'Literal' && typeof val.value === 'string') {
                const m = val.value.match(/^(\d+)px$/);
                if (m) num = parseInt(m[1], 10);
              }
              if (num === null) continue;
              if (GRID[num]) {
                context.report({
                  node: prop,
                  messageId: 'space',
                  data: { key: keyName, val: num, tok: GRID[num] },
                });
              }
            }
          },
        };
      },
    },

    /**
     * JSX `style={{ fontSize: 13 }}` 같은 인라인 폰트 크기 px 차단.
     * `<Text variant="...">` 또는 className `text-[length:var(--fs-*)]` 사용.
     */
    'no-inline-fontsize-in-style': {
      meta: {
        type: 'problem',
        docs: { description: 'JSX style 안 fontSize px → <Text variant> 또는 var(--fs-*) 토큰 사용' },
        schema: [],
        messages: {
          fontSize: '`fontSize: {{val}}` — `<Text variant="...">` 또는 className `text-[length:var(--fs-*)]` 사용',
        },
      },
      create(context) {
        return {
          JSXAttribute(node) {
            if (node.name?.name !== 'style') return;
            const v = node.value;
            if (!v || v.type !== 'JSXExpressionContainer') return;
            const expr = v.expression;
            if (expr.type !== 'ObjectExpression') return;
            for (const prop of expr.properties) {
              if (prop.type !== 'Property') continue;
              const keyName = prop.key.type === 'Identifier' ? prop.key.name
                : prop.key.type === 'Literal' ? prop.key.value : null;
              if (keyName !== 'fontSize') continue;
              const val = prop.value;
              let num = null;
              if (val.type === 'Literal' && typeof val.value === 'number') {
                num = val.value;
              } else if (val.type === 'Literal' && typeof val.value === 'string') {
                const m = val.value.match(/^(\d+)px$/);
                if (m) num = parseInt(m[1], 10);
              }
              if (num !== null) {
                context.report({ node: prop, messageId: 'fontSize', data: { val: num } });
              }
            }
          },
        };
      },
    },

    /**
     * JSX `style={{ borderRadius: 8 }}` 같은 인라인 모서리 px 차단.
     * `var(--r-sm|md|lg|xl)` 또는 className `rounded-[var(--r-*)]` 사용.
     */
    'no-inline-borderradius-in-style': {
      meta: {
        type: 'problem',
        docs: { description: 'JSX style 안 borderRadius px → var(--r-*) 토큰 사용' },
        schema: [],
        messages: {
          radius: '`borderRadius: {{val}}` — `var(--r-sm|md|lg|xl)` 또는 className `rounded-[var(--r-*)]` 사용',
        },
      },
      create(context) {
        return {
          JSXAttribute(node) {
            if (node.name?.name !== 'style') return;
            const v = node.value;
            if (!v || v.type !== 'JSXExpressionContainer') return;
            const expr = v.expression;
            if (expr.type !== 'ObjectExpression') return;
            for (const prop of expr.properties) {
              if (prop.type !== 'Property') continue;
              const keyName = prop.key.type === 'Identifier' ? prop.key.name
                : prop.key.type === 'Literal' ? prop.key.value : null;
              if (keyName !== 'borderRadius') continue;
              const val = prop.value;
              let num = null;
              if (val.type === 'Literal' && typeof val.value === 'number') {
                num = val.value;
              } else if (val.type === 'Literal' && typeof val.value === 'string') {
                const m = val.value.match(/^(\d+)px$/);
                if (m) num = parseInt(m[1], 10);
              }
              // 0 / 9999 (pill) 은 의미 고정 → 허용. 토큰화 의미 있는 4/6/8/12/16 만 보고.
              if (num !== null && num !== 0 && num < 9999) {
                context.report({ node: prop, messageId: 'radius', data: { val: num } });
              }
            }
          },
        };
      },
    },

    /**
     * JSX style prop 안 색공간 함수(rgb/rgba/hsl/oklch/oklab) 직지정 차단.
     * 색은 디자인 토큰 var(--ink-*|bg-*|accent|...) 또는 color-mix(in oklch, var(--*) ...) 로.
     * `color-mix(in oklch, ...)` 의 `oklch` 키워드는 함수 호출이 아니라 통과.
     */
    'no-color-space-in-jsx-style': {
      meta: {
        type: 'problem',
        docs: { description: 'JSX style 안 rgb/rgba/hsl/oklch/oklab 함수 → 색 토큰 사용' },
        schema: [],
        messages: {
          fn: '`{{fn}}(` — 색 토큰(`var(--ink-*|bg-*|accent|lime|...)`) 또는 `color-mix(in oklch, var(--*) X%, transparent)` 사용',
        },
      },
      create(context) {
        const COLOR_FN = /\b(rgb|rgba|hsl|hsla|oklch|oklab)\s*\(/;
        return {
          JSXAttribute(node) {
            if (node.name?.name !== 'style') return;
            const src = context.getSourceCode().getText(node);
            const m = src.match(COLOR_FN);
            if (m) context.report({ node, messageId: 'fn', data: { fn: m[1] } });
          },
        };
      },
    },

    /**
     * JSX style prop 안 hex 컬러 차단 (`style={{ color: '#fff' }}`).
     * CSS 변수만 허용.
     */
    'no-hex-color-in-jsx-style': {
      meta: {
        type: 'problem',
        docs: { description: 'JSX style prop 에 hex 컬러 직지정 금지 — `var(--*)` 또는 컴포넌트 prop 사용' },
        schema: [],
        messages: {
          hex: '`{{hex}}` — 색상 토큰(`var(--accent|color-*|ink-*)`) 사용. 신규 색은 `src/theme/themes/` 에 추가.',
        },
      },
      create(context) {
        return {
          JSXAttribute(node) {
            if (node.name?.name !== 'style') return;
            const src = context.getSourceCode().getText(node);
            const m = src.match(HEX_COLOR);
            if (m) context.report({ node, messageId: 'hex', data: { hex: m[0] } });
          },
        };
      },
    },
  },
};

// ---- 설정 ----

export default tseslint.config(
  { ignores: ['dist/', 'dist-maintenance/', 'node_modules/', '**/*.config.{js,ts}', 'scripts/', 'e2e/', 'public/'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'design-system': designSystem,
    },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2022 },
    },
    settings: { react: { version: '19.0' } },
    rules: {
      // --- 디자인 시스템 강제 ---
      'design-system/no-token-bypass-classname': 'warn', // 4주 후 error
      'design-system/no-hex-color-in-jsx-style': 'warn',
      'design-system/no-inline-px-spacing': 'warn',
      // (2026-05-30 추가) 룰이 못 잡던 인라인 style 누수 — fontSize / borderRadius / 색공간 함수.
      'design-system/no-inline-fontsize-in-style': 'warn',
      'design-system/no-inline-borderradius-in-style': 'warn',
      'design-system/no-color-space-in-jsx-style': 'warn',

      // --- 로깅 위생 (2026-06-06 추가) ---
      // 프로덕션 코드의 raw console.* 차단. 프론트 표준 로거는 `errorLogger.logClientError`
      // (Sentry + 서버 `error_logs` 이중 기록) — catch 블록의 console.error 는 브라우저
      // 콘솔에만 남아 운영에서 안 보인다(서버 Cloud Functions 는 firebase-functions/logger,
      // functions/eslint 의 no-console 로 이미 강제). 의도적 예외는 인라인
      // `// eslint-disable-next-line no-console`. 기존 ~148건 점진 정리 대상이라 warn 으로
      // 시작(디자인 룰과 동일, 후속 error 승격).
      'no-console': 'warn',

      // --- 기존 코드 잡음 억제 (점진 강화) ---
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      // 16건의 조건부 hook 호출 — 진짜 버그지만 별도 PR 에서 수정.
      // 디자인 시스템 PR 의 머지를 막지 않기 위해 warn 으로 시작.
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'off', // 너무 시끄러움 — 별도 PR
    },
  },

  // 디자인 시스템 컴포넌트 자신은 자기 룰 면제 (토큰을 정의/소비하는 곳)
  {
    files: ['src/theme/**/*.{ts,tsx}'],
    rules: {
      'design-system/no-token-bypass-classname': 'off',
      'design-system/no-hex-color-in-jsx-style': 'off',
      'design-system/no-inline-px-spacing': 'off',
      'design-system/no-inline-fontsize-in-style': 'off',
      'design-system/no-inline-borderradius-in-style': 'off',
      'design-system/no-color-space-in-jsx-style': 'off',
    },
  },

  // 로깅 구현체 자신은 no-console 면제 — 표준 로거가 최후수단으로 console 을 쓸 수 있다.
  {
    files: ['src/services/errorLogger.ts', 'src/services/sentry.ts'],
    rules: { 'no-console': 'off' },
  },

  // 테스트 — 룰 완화
  {
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**'],
    rules: {
      'design-system/no-token-bypass-classname': 'off',
      'design-system/no-hex-color-in-jsx-style': 'off',
      'design-system/no-inline-px-spacing': 'off',
      'design-system/no-inline-fontsize-in-style': 'off',
      'design-system/no-inline-borderradius-in-style': 'off',
      'design-system/no-color-space-in-jsx-style': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off',
    },
  },
);
