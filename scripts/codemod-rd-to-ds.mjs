#!/usr/bin/env node
// 최종 잔존 rd-* → ds-* className 토큰 치환 (template literal 안 포함).
//
// 컴포넌트 마이그레이션 (<Button> / <Card>) 가 어려운 케이스:
//   - <Link> / <a> 태그 (router/href 보존 필요)
//   - className 안 동적 부분 (`${cond ? 'x' : ''}`) — 컴포넌트 prop 으로 옮기기 부자연
//
// 위 케이스는 `buttonClass()` 헬퍼 또는 raw `ds-*` 클래스 사용이 정답.
// 본 codemod 는 className/class 문자열 안 토큰만 1:1 대체:
//
//   rd-btn               → ds-btn ds-btn--md
//   rd-btn--primary      → ds-btn--primary
//   rd-btn--ghost        → ds-btn--ghost
//   rd-btn--danger       → ds-btn--danger
//   rd-btn--sm           → ds-btn--sm
//   rd-card              → ds-card ds-card--bare   (padding 무 — 기존 rd-card 동작 보존)
//   rd-chip              → ds-chip
//   rd-chip--lime|aqua   → ds-chip--accent
//   rd-chip--amber       → ds-chip--warning
//   rd-chip--muted       → (드롭, ds-chip 만)
//
// 변환 후 lint design-system/no-token-bypass-classname 0건 목표.
//
// 사용: node scripts/codemod-rd-to-ds.mjs [--dry]

import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry');

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

// 길이 긴 패턴부터 (rd-btn--primary 가 rd-btn 보다 먼저 매치되어야 함)
const TOKEN_MAP = [
  ['rd-btn--primary', 'ds-btn--primary'],
  ['rd-btn--ghost', 'ds-btn--ghost'],
  ['rd-btn--danger', 'ds-btn--danger'],
  ['rd-btn--secondary', 'ds-btn--secondary'],
  ['rd-btn--sm', 'ds-btn--sm'],
  ['rd-btn--lg', 'ds-btn--lg'],
  ['rd-btn', 'ds-btn ds-btn--md'],
  ['rd-card', 'ds-card ds-card--bare'],
  ['rd-chip--lime', 'ds-chip--accent'],
  ['rd-chip--aqua', 'ds-chip--accent'],
  ['rd-chip--amber', 'ds-chip--warning'],
  ['rd-chip--muted', ''],  // 그냥 드롭
  ['rd-chip', 'ds-chip'],
];

function replaceInClassString(cls) {
  let updated = cls;
  for (const [from, to] of TOKEN_MAP) {
    const escaped = from.replace(/[-/]/g, '\\$&');
    const re = new RegExp('\\b' + escaped + '\\b', 'g');
    updated = updated.replace(re, to);
  }
  // 연속 공백 정리
  return updated.replace(/\s{2,}/g, ' ').trim();
}

let totalReplacements = 0;
let totalFiles = 0;

const files = walk('src');
for (const f of files) {
  if (f.includes('/theme/')) continue;
  if (f.includes('.test.')) continue;
  let src = fs.readFileSync(f, 'utf8');
  if (!/\brd-(btn|card|chip)\b/.test(src)) continue;
  const before = src;

  // className="..." (literal)
  src = src.replace(/className="([^"]*)"/g, (m, cls) => {
    if (!/\brd-(btn|card|chip)\b/.test(cls)) return m;
    const updated = replaceInClassString(cls);
    return `className="${updated}"`;
  });

  // className={`...`} (template literal — ${} 내부는 건드리지 않고 quasi 부분만)
  src = src.replace(/className=\{`([^`]*)`\}/g, (m, content) => {
    if (!/\brd-(btn|card|chip)\b/.test(content)) return m;
    // ${...} expression 부분을 보호하며 처리
    const parts = content.split(/(\$\{[^}]*\})/);
    const out = parts.map((p, i) => {
      if (i % 2 === 1) return p; // ${} expression 은 그대로
      if (!/\brd-(btn|card|chip)\b/.test(p)) return p;
      return replaceInClassString(p).replace(/\s+$/, ' ');  // 토큰 사이 공백 유지
    }).join('');
    return `className={\`${out}\`}`;
  });

  // 변수에 할당된 문자열 안 rd-* — `const cls = "rd-btn..."` 같은 패턴
  // 안전성 위해 quoted string + rd-btn|card|chip 조합만 매치
  src = src.replace(/(["'])([^"'\n]*\brd-(?:btn|card|chip)[^"'\n]*)\1/g, (m, q, cls) => {
    // JSX className= 가 아닌 컨텍스트 — 변수 할당 등
    const updated = replaceInClassString(cls);
    return `${q}${updated}${q}`;
  });

  if (src !== before) {
    if (!DRY) fs.writeFileSync(f, src);
    totalFiles++;
    // count by counting rd- → ds- delta is tricky; just bump per-file
    const beforeCount = (before.match(/\brd-(btn|card|chip)\b/g) || []).length;
    const afterCount = (src.match(/\brd-(btn|card|chip)\b/g) || []).length;
    const delta = beforeCount - afterCount;
    totalReplacements += delta;
    console.log(`  ${f}: ${delta} tokens`);
  }
}

console.log(`\n${DRY ? '[dry-run] ' : ''}${totalReplacements} tokens across ${totalFiles} files`);
