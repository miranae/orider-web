#!/usr/bin/env node
// 인라인 style 의 px 스페이싱 → var(--space-N) 토큰 codemod.
//
// 매핑 (8pt grid):
//   4  → var(--space-1)
//   8  → var(--space-2)
//   12 → var(--space-3)
//   16 → var(--space-4)
//   20 → var(--space-5)
//   24 → var(--space-6)
//   32 → var(--space-7)
//   48 → var(--space-8)
//
// 대상 prop: padding(*), margin(*), gap, rowGap, columnGap
// 형식:
//   숫자 — `padding: 16` → `padding: 'var(--space-4)'`
//   문자열 — `padding: "16px"` → `padding: 'var(--space-4)'`
//   shorthand 문자열 — `padding: "16px 20px"` → `padding: 'var(--space-4) var(--space-5)'`
//   삼항 — `padding: dense ? 16 : 20` → `padding: dense ? 'var(--space-4)' : 'var(--space-5)'`
//
// 제외 (off-grid 값 — 디자이너 의도적 offset 가능성):
//   2, 3, 6, 10, 14, 18, 26, 28 등 — 그대로 유지 (별도 PR 에서 site-by-site 검토)
//
// 사용: node scripts/codemod-spacing.mjs [--dry]

import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry');

const SPACE_MAP = {
  4: 'var(--space-1)',
  8: 'var(--space-2)',
  12: 'var(--space-3)',
  16: 'var(--space-4)',
  20: 'var(--space-5)',
  24: 'var(--space-6)',
  32: 'var(--space-7)',
  48: 'var(--space-8)',
};

const SPACING_KEYS = [
  'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingInline', 'paddingBlock',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginInline', 'marginBlock',
  'gap', 'rowGap', 'columnGap',
];
const KEY_RE = new RegExp(`\\b(${SPACING_KEYS.join('|')})\\b`);

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      out.push(...walk(p));
    } else if (ent.name.endsWith('.tsx') || ent.name.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

/** 단일 px 값 문자열 → 토큰. 그리드 아니면 null. */
function mapPxString(val) {
  // "16px" or "16PX"
  const m = val.match(/^(\d+)px$/i);
  if (!m) return null;
  return SPACE_MAP[parseInt(m[1], 10)] ?? null;
}

/** "16px 20px" 같은 shorthand → "var(--space-4) var(--space-5)". 모든 토큰이 매핑돼야 변환. */
function mapShorthand(val) {
  const parts = val.trim().split(/\s+/);
  if (parts.length < 2 || parts.length > 4) return null;
  const mapped = parts.map(mapPxString);
  if (mapped.some(x => x === null)) return null;
  return mapped.join(' ');
}

let totalSites = 0;
let totalFiles = 0;
const valueCount = {};

const files = walk('src');
for (const f of files) {
  if (f.includes('/theme/')) continue;
  if (f.includes('.test.')) continue;
  let src = fs.readFileSync(f, 'utf8');
  if (!KEY_RE.test(src)) continue;
  const before = src;
  let fileCount = 0;

  // ⚠️ Chart.js options.padding, Mapbox fitBounds padding 등 *CSS 아닌* 라이브러리 옵션을
  //    잘못 변환하지 않도록 JSX `style={{...}}` 와 명시적 `: CSSProperties` 안만 매치.
  // 안전성: balanced-brace 처리 없이 단순 정규식이지만, 매치 위치를 사전 필터링.
  function isInCssContext(srcText, pos) {
    // pos 위치에서 역방향으로 가장 가까운 `style={{` 또는 `: CSSProperties = {` 또는 `: CSSProperties[]` 검색
    const head = srcText.slice(0, pos);
    const lastStyle = Math.max(
      head.lastIndexOf('style={{'),
      head.lastIndexOf('style: {'),
      head.lastIndexOf(': CSSProperties = {'),
      head.lastIndexOf(': CSSProperties> = {'),
    );
    if (lastStyle < 0) return false;
    // 그 사이에 닫는 `}}` 가 있으면 우리는 그 밖 — false
    // 단순 휴리스틱: 깊이 카운트
    let depth = 0;
    for (let k = lastStyle; k < pos; k++) {
      const c = srcText[k];
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    return depth > 0; // 아직 객체 안
  }

  // 1) 숫자 리터럴: `key: 16` (콤마/} 종료)
  src = src.replace(
    new RegExp(`\\b(${SPACING_KEYS.join('|')})\\s*:\\s*(\\d+)(?=[,}\\s])`, 'g'),
    (full, key, num, offset) => {
      if (!isInCssContext(src, offset)) return full;
      const n = parseInt(num, 10);
      const token = SPACE_MAP[n];
      if (!token) return full;
      fileCount++;
      valueCount[n] = (valueCount[n] || 0) + 1;
      return `${key}: '${token}'`;
    },
  );

  // 2) 문자열 single px: `key: "16px"` 또는 `key: '16px'`
  src = src.replace(
    new RegExp(`\\b(${SPACING_KEYS.join('|')})\\s*:\\s*(['"])(\\d+px)\\2`, 'g'),
    (full, key, q, val) => {
      const token = mapPxString(val);
      if (!token) return full;
      fileCount++;
      const n = parseInt(val, 10);
      valueCount[n] = (valueCount[n] || 0) + 1;
      return `${key}: ${q}${token}${q}`;
    },
  );

  // 3) shorthand 문자열: `key: "16px 20px"` 등
  src = src.replace(
    new RegExp(`\\b(${SPACING_KEYS.join('|')})\\s*:\\s*(['"])(\\d+px(?:\\s+\\d+px){1,3})\\2`, 'g'),
    (full, key, q, val) => {
      const token = mapShorthand(val);
      if (!token) return full;
      fileCount++;
      valueCount['short'] = (valueCount['short'] || 0) + 1;
      return `${key}: ${q}${token}${q}`;
    },
  );

  // 4) 삼항 — `key: cond ? 16 : 20`
  src = src.replace(
    new RegExp(`\\b(${SPACING_KEYS.join('|')})\\s*:\\s*([^?,}\\n]+?\\?)\\s*(\\d+)\\s*:\\s*(\\d+)(?=[,}\\s])`, 'g'),
    (full, key, cond, a, b) => {
      const ta = SPACE_MAP[parseInt(a, 10)];
      const tb = SPACE_MAP[parseInt(b, 10)];
      if (!ta || !tb) return full;
      fileCount++;
      valueCount['ternary'] = (valueCount['ternary'] || 0) + 1;
      return `${key}: ${cond} '${ta}' : '${tb}'`;
    },
  );

  if (src !== before) {
    if (!DRY) fs.writeFileSync(f, src);
    totalFiles++;
    totalSites += fileCount;
  }
}

console.log('=== 값별 카운트 ===');
const sorted = Object.entries(valueCount).sort((a, b) => Number(b[1]) - Number(a[1]));
for (const [v, c] of sorted) console.log(`  ${String(c).padStart(4)}  ${v}`);
console.log(`\n${DRY ? '[dry-run] ' : ''}${totalSites} replacements across ${totalFiles} files`);
