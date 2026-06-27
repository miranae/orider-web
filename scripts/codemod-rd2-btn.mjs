#!/usr/bin/env node
// rd2-btn → <Button> codemod.
//
// 변환 매핑:
//   className="rd2-btn"                         → variant="secondary"
//   className="rd2-btn rd2-btn--primary"        → variant="primary"
//   className="rd2-btn rd2-btn--ghost"          → variant="ghost"
//   className="rd2-btn rd2-btn--danger"         → variant="danger"
//   className="rd2-btn rd2-btn--sm"             → variant="secondary" size="sm"
//   className="rd2-btn rd2-btn--ghost rd2-btn--sm" → variant="ghost" size="sm"
//
// 추가 작업:
//   - <button …>…</button> → <Button …>…</Button> (매칭 종료 태그도 변환)
//   - 파일 상단에 `import { Button } from "../../theme/components";` 자동 추가 (없을 때)
//
// 안전장치:
//   - rd2-btn 가 *없는* <button> 은 건드리지 않음
//   - <button> 이 nested 인 경우(드물지만) 적절한 매칭 종료 태그 추적
//   - 변환 전후 diff line 수 출력
//
// 사용: node scripts/codemod-rd2-btn.mjs [--dry]

import fs from 'node:fs';
import path from 'node:path';

const FILES = [
  'src/components/settings/PaneAccount.tsx',
  'src/components/settings/PaneApp.tsx',
  'src/components/settings/PaneConnections.tsx',
  'src/components/settings/PaneDevice.tsx',
  'src/components/settings/PaneEquipment.tsx',
  'src/components/settings/PaneTraining.tsx',
  'src/components/settings/ProfileHero.tsx',
  'src/components/settings/LayoutEditorCard.tsx',
];

const DRY = process.argv.includes('--dry');

function mapClass(cls) {
  const variant = cls.includes('rd2-btn--primary') ? 'primary'
    : cls.includes('rd2-btn--ghost') ? 'ghost'
    : cls.includes('rd2-btn--danger') ? 'danger'
    : 'secondary';
  const size = cls.includes('rd2-btn--sm') ? 'sm' : null;
  let props = `variant="${variant}"`;
  if (size) props += ` size="${size}"`;
  return props;
}

function findEndOfOpenTag(src, start) {
  let i = start;
  let inStr = null;
  let braceDepth = 0;
  while (i < src.length) {
    const ch = src[i];
    if (inStr) {
      if (ch === inStr && src[i - 1] !== '\\') inStr = null;
      i++; continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; i++; continue; }
    if (ch === '{') { braceDepth++; i++; continue; }
    if (ch === '}') { braceDepth--; i++; continue; }
    if (ch === '>' && braceDepth === 0) return i;
    i++;
  }
  throw new Error('unterminated opening tag at ' + start);
}

function findMatchingClose(src, start) {
  let depth = 1;
  let i = start;
  while (i < src.length) {
    const o = src.indexOf('<button', i);
    const c = src.indexOf('</button>', i);
    if (c < 0) throw new Error('unmatched </button>');
    if (o >= 0 && o < c) {
      // verify it's a tag, not text — next char should not be a letter/digit
      const after = src[o + 7];
      if (after === '>' || after === ' ' || after === '\n' || after === '\t' || after === '/') {
        depth++;
        i = o + 7;
        continue;
      }
      i = o + 7;
      continue;
    }
    depth--;
    if (depth === 0) return c;
    i = c + 9;
  }
  throw new Error('unmatched <button>');
}

function transform(src) {
  let out = '';
  let i = 0;
  let count = 0;
  while (i < src.length) {
    const idx = src.indexOf('<button', i);
    if (idx < 0) { out += src.slice(i); break; }
    // must be tag (not e.g. "buttonish" word)
    const after = src[idx + 7];
    if (!(after === '>' || after === ' ' || after === '\n' || after === '\t' || after === '/')) {
      out += src.slice(i, idx + 7);
      i = idx + 7;
      continue;
    }
    out += src.slice(i, idx);
    const endOpen = findEndOfOpenTag(src, idx);
    const openTag = src.slice(idx, endOpen + 1);
    const m = openTag.match(/className="(rd2-btn[^"]*)"/);
    if (!m) {
      out += openTag;
      i = endOpen + 1;
      continue;
    }
    const props = mapClass(m[1]);
    // remove the className attr (with surrounding whitespace)
    const newOpen = openTag
      .replace(/^<button/, '<Button')
      .replace(/\s*className="rd2-btn[^"]*"/, ` ${props}`);
    out += newOpen;
    count++;
    // find matching </button> from position after openTag
    const closePos = findMatchingClose(src, endOpen + 1);
    out += src.slice(endOpen + 1, closePos) + '</Button>';
    i = closePos + 9;
  }
  return { code: out, count };
}

function ensureImport(src, fileDir) {
  if (/from\s+["'][^"']*\/theme(\/components)?["']/.test(src) && /\bButton\b/.test(src)) return src;
  // determine relative path to src/theme/components
  // fileDir is absolute; we want relative from fileDir to <root>/src/theme/components
  const root = path.resolve('src');
  const relToTheme = path.relative(fileDir, path.join(root, 'theme/components')) || '.';
  const importPath = relToTheme.startsWith('.') ? relToTheme : './' + relToTheme;
  const importLine = `import { Button } from "${importPath}";\n`;
  // insert after the last top-level `import ... from ...;` line
  const importRegex = /^import\s+[^;]+;[ \t]*$/gm;
  let last;
  let m;
  while ((m = importRegex.exec(src))) last = m;
  if (!last) return importLine + src;
  const insertAt = last.index + last[0].length;
  return src.slice(0, insertAt) + '\n' + importLine.trimEnd() + src.slice(insertAt);
}

let total = 0;
for (const rel of FILES) {
  const abs = path.resolve(rel);
  const before = fs.readFileSync(abs, 'utf8');
  const { code, count } = transform(before);
  if (count === 0) {
    console.log(`  ${rel}: no rd2-btn`);
    continue;
  }
  const withImport = ensureImport(code, path.dirname(abs));
  total += count;
  console.log(`  ${rel}: ${count} <button> → <Button>`);
  if (!DRY) fs.writeFileSync(abs, withImport);
}
console.log(`\n${DRY ? '[dry-run] ' : ''}total ${total} sites across ${FILES.length} files`);
