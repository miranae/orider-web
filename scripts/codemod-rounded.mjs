#!/usr/bin/env node
// Tailwind `rounded-(sm|md|lg|xl|2xl)` → `rounded-[var(--r-*)]` codemod.
//
// 동기: rounded-md 같은 하드 클래스는 cornerRadius 토큰 교체(theme.dimens.cornerRadiusM 등)
// 를 무력화. arbitrary value 문법 `rounded-[var(--r-md)]` 로 치환하면 테마 교체 즉시 반영.
//
// 매핑:
//   rounded-sm  → rounded-[var(--r-sm)]   (4px)
//   rounded-md  → rounded-[var(--r-md)]   (6px or 8px in app-parity)
//   rounded-lg  → rounded-[var(--r-lg)]   (10px or 12px in app-parity)
//   rounded-xl  → rounded-[var(--r-xl)]   (16px)
//   rounded-2xl → rounded-[var(--r-xl)]   (토큰 없음 — xl 로 합침)
//
// 제외:
//   rounded-full / rounded-none — 의미 토큰 아님, 유지
//   rounded-tl-* / 부분 모서리 — 자주 안 쓰임, 수동 처리
//   rounded (no suffix, =sm) — Tailwind default, 유지
//
// 사용: node scripts/codemod-rounded.mjs [--dry]

import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry');

const MAP = {
  'rounded-sm': 'rounded-[var(--r-sm)]',
  'rounded-md': 'rounded-[var(--r-md)]',
  'rounded-lg': 'rounded-[var(--r-lg)]',
  'rounded-xl': 'rounded-[var(--r-xl)]',
  'rounded-2xl': 'rounded-[var(--r-xl)]',
  // bare rounded (= 4px sm equivalent) — 토큰화
  'rounded': 'rounded-[var(--r-sm)]',
};

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

const files = walk('src');
let totalFiles = 0;
let totalReplacements = 0;

for (const f of files) {
  if (f.includes('/theme/')) continue;
  if (f.includes('.test.')) continue;
  let src = fs.readFileSync(f, 'utf8');
  if (!/\brounded(-(sm|md|lg|xl|2xl))?\b/.test(src)) continue;

  let count = 0;
  // className/class 속성 안 문자열만 치환 — JSX prop 이름이나 키와 충돌 방지.
  // 매치 대상: className="..." (literal) 또는 className={`...`} (template literal)
  // 그 안에서 토큰 단위 치환.
  function replaceInClassString(classStr) {
    let updated = classStr;
    for (const [from, to] of Object.entries(MAP)) {
      const escaped = from.replace(/[-/]/g, '\\$&');
      const re = from === 'rounded'
        ? /\brounded(?![-\w\[])/g
        : new RegExp('\\b' + escaped + '\\b', 'g');
      updated = updated.replace(re, () => { count++; return to; });
    }
    return updated;
  }
  src = src.replace(/className="([^"]*)"/g, (m, cls) => `className="${replaceInClassString(cls)}"`);
  src = src.replace(/className=\{`([^`]*)`\}/g, (m, cls) => `className={\`${replaceInClassString(cls)}\`}`);
  src = src.replace(/class="([^"]*)"/g, (m, cls) => `class="${replaceInClassString(cls)}"`); // (드물지만 SVG 등)

  if (count > 0) {
    if (!DRY) fs.writeFileSync(f, src);
    totalFiles++;
    totalReplacements += count;
    console.log(`  ${f}: ${count} replacements`);
  }
}

console.log(`\n${DRY ? '[dry-run] ' : ''}${totalReplacements} replacements across ${totalFiles} files`);
