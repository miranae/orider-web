#!/usr/bin/env node
// Tailwind 사이즈/색 우회 일괄 치환 — 테마 토큰 즉시 반영하도록.
//
// 매핑 (모두 themable):
//   text-xs   → text-[var(--fs-xs)]
//   text-sm   → text-[var(--fs-sm)]
//   text-base → text-[var(--fs-base)]
//   text-md   → text-[var(--fs-md)]
//   text-lg   → text-[var(--fs-lg)]
//   text-xl   → text-[var(--fs-xl)]
//   text-2xl  → text-[var(--fs-2xl)]
//   text-3xl  → text-[var(--fs-3xl)]
//   text-4xl  → text-[36px]  (토큰 없음, 직지정 유지)
//   text-5xl  → text-[48px]
//
//   text-white → text-[var(--ink-0)]   (다크 테마 잉크 = 흰색)
//   text-black → text-[var(--ink-0)]   (라이트 테마 잉크 = 검정)
//
// JSX style 안 hex:
//   '#fff' / '#ffffff' / '#FFFFFF' → 'var(--ink-0)' (when key is color)
//   '#000' / '#000000' → 'var(--ink-0)'
//
// 제외:
//   bg-gray-* / text-gray-* — 맥락 의존 (라이트는 어두운 회색, 다크는 밝은 회색) 자동 변환 X
//   hex 가 background 인 경우 — 컨텍스트 모름 (var(--bg-*) 단계 모호)
//
// 사용: node scripts/codemod-tailwind-bypass.mjs [--dry]

import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry');

const SIZE_MAP = {
  'text-xs': 'text-[var(--fs-xs)]',
  'text-sm': 'text-[var(--fs-sm)]',
  'text-base': 'text-[var(--fs-base)]',
  'text-md': 'text-[var(--fs-md)]',
  'text-lg': 'text-[var(--fs-lg)]',
  'text-xl': 'text-[var(--fs-xl)]',
  'text-2xl': 'text-[var(--fs-2xl)]',
  'text-3xl': 'text-[var(--fs-3xl)]',
  'text-4xl': 'text-[36px]',
  'text-5xl': 'text-[48px]',
};

const INK_MAP = {
  'text-white': 'text-[var(--ink-0)]',
  'text-black': 'text-[var(--ink-0)]',
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

let totalReplacements = 0;
let totalFiles = 0;
const counts = {};

/** hex → 토큰 매핑 단일 함수. */
function mapHexToToken(hex) {
  const lc = hex.toLowerCase();
  if (/^#(fff|ffffff)$/.test(lc)) return 'var(--ink-0)';
  if (/^#(000|000000|111|111111)$/.test(lc)) return 'var(--ink-0)';
  if (/^#(fc5200|cc4200|f97316|fc4c02)$/.test(lc)) return 'var(--accent)';
  if (/^#(666|666666|9ca3af|999|999999)$/.test(lc)) return 'var(--ink-3)';
  if (/^#(374151|4b5563)$/.test(lc)) return 'var(--ink-2)';
  if (/^#(f0f0f0|e0e0e0|f3f4f6)$/.test(lc)) return 'var(--bg-3)';
  if (/^#(041820)$/.test(lc)) return 'var(--bg-0)';
  if (/^#(22c55e|16a34a|4caf50|2e7d32)$/.test(lc)) return 'var(--color-success)';
  if (/^#(ef4444|dc2626|c62828|b71c1c)$/.test(lc)) return 'var(--color-error)';
  if (/^#(3b82f6|1976d2|4a90e2|1565c0)$/.test(lc)) return 'var(--color-brand-bike)';
  if (/^#(06b6d4|0277bd|29b6f6)$/.test(lc)) return 'var(--chart-cadence)';
  if (/^#(eeeeee|e5e7eb)$/.test(lc)) return 'var(--bg-3)';
  if (/^#(d1d5db|cccccc)$/.test(lc)) return 'var(--line)';
  return null;
}

const files = walk('src');
for (const f of files) {
  if (f.includes('/theme/')) continue;
  if (f.includes('.test.')) continue;
  let src = fs.readFileSync(f, 'utf8');
  const before = src;
  let fileCount = 0;

  // 1) size + ink mechanical replacements with word boundary
  for (const [from, to] of Object.entries({ ...SIZE_MAP, ...INK_MAP })) {
    const re = new RegExp('\\b' + from.replace(/[-/]/g, '\\$&') + '\\b(?!-\\[)', 'g');
    src = src.replace(re, () => {
      fileCount++;
      counts[from] = (counts[from] || 0) + 1;
      return to;
    });
  }

  // 2) JSX style 안 hex 컬러
  //    style={{ color: '#fff' }} / style={{ border: "1px solid #fff" }} → var(--*)
  //
  // 매치 전략:
  //   (a) `key: '#hex'` — color/background/borderColor 키 직접 지정
  //   (b) 'Npx style #hex' 또는 'solid #hex' — border 같은 shorthand 안 임베디드 hex
  src = src.replace(
    /style=\{\{([^{}]*)\}\}/g,
    (full, body) => {
      let changed = false;
      // (b) shorthand 안 hex 먼저 처리 (예: 'solid #fff' → 'solid var(--ink-0)')
      let newBody = body.replace(
        /(['"])([^'"]*?(?:px|em|rem|%)\s+(?:solid|dashed|dotted)\s+)(#[0-9a-fA-F]{3,8})([^'"]*?)\1/g,
        (_, q, prefix, hex, suffix) => {
          const token = mapHexToToken(hex);
          if (!token) return _;
          changed = true; fileCount++;
          counts[hex.toLowerCase()] = (counts[hex.toLowerCase()] || 0) + 1;
          return `${q}${prefix}${token}${suffix}${q}`;
        },
      );
      // (a) 색-속성 다음 hex
      newBody = newBody.replace(
        /\b(color|background|backgroundColor|borderColor|fill|stroke|outlineColor)\s*:\s*(['"])(#[0-9a-fA-F]{3,8})\2/g,
        (_, key, q, hex) => {
          const token = mapHexToToken(hex);
          if (!token) return _;
          changed = true;
          fileCount++;
          counts[hex.toLowerCase()] = (counts[hex.toLowerCase()] || 0) + 1;
          return `${key}: ${q}${token}${q}`;
        },
      );
      return changed ? `style={{${newBody}}}` : full;
    },
  );

  if (src !== before) {
    if (!DRY) fs.writeFileSync(f, src);
    totalFiles++;
    totalReplacements += fileCount;
  }
}

console.log('=== top patterns ===');
const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
for (const [k, v] of sorted) console.log(`  ${v.toString().padStart(4)}  ${k}`);
console.log(`\n${DRY ? '[dry-run] ' : ''}${totalReplacements} replacements across ${totalFiles} files`);
