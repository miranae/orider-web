#!/usr/bin/env node
// rd-btn / rd-chip → <Button> / <Chip> codemod.
//
// 변환 대상: className 이 rd-btn / rd-chip 만 포함 (Tailwind 잡탕 X).
// 혼합 className(예: `rd-btn flex items-center gap-1`)은 의도/시각 검토 필요 → 스킵.
//
// rd-card 는 의도적 제외 — `.rd-card` 는 padding 무, `<Card>` 기본 padding 16px →
// 일괄 치환 시 모든 카드 레이아웃이 폭증. 별도 PR 에서 site-by-site.
//
// 사용: node scripts/codemod-rd.mjs [--dry]

import fs from 'node:fs';
import path from 'node:path';
import { globSync } from 'node:fs';

const DRY = process.argv.includes('--dry');

// 파일 수집 — src/ 전체 .tsx
function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      out.push(...walk(p));
    } else if (ent.name.endsWith('.tsx')) {
      out.push(p);
    }
  }
  return out;
}

// className → props 매핑
function mapBtnClass(cls) {
  const variant = cls.includes('rd-btn--primary') ? 'primary'
    : cls.includes('rd-btn--ghost') ? 'ghost'
    : cls.includes('rd-btn--danger') ? 'danger'
    : 'secondary';
  const size = cls.includes('rd-btn--sm') ? 'sm' : null;
  let props = `variant="${variant}"`;
  if (size) props += ` size="${size}"`;
  return props;
}

function mapChipClass(cls) {
  // rd-chip / rd-chip--lime|aqua|amber|muted
  const variant = cls.includes('rd-chip--lime') ? 'accent'
    : cls.includes('rd-chip--aqua') ? 'accent'  // map to accent (info 색은 별도 prop 없음)
    : cls.includes('rd-chip--amber') ? 'warning'
    : 'default';
  return variant === 'default' ? '' : `variant="${variant}"`;
}

// className 이 *오직* rd-btn[--*]?(공백 + rd-btn--*)* 토큰만 포함하는지 (혼합 X)
function isPureBtnClass(cls) {
  return /^(\s*rd-btn(--[\w-]+)?\s*)+$/.test(cls);
}
function isPureChipClass(cls) {
  return /^(\s*rd-chip(--[\w-]+)?\s*)+$/.test(cls);
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
    if (ch === '>' && braceDepth === 0) {
      // self-closing? check previous non-space char
      return i;
    }
    i++;
  }
  throw new Error('unterminated open tag');
}

function findMatchingClose(src, start, tag) {
  // start 는 첫 opening tag 의 '>' 다음 위치.
  // 같은 tag 의 nested 개수를 카운트하며 매칭되는 </tag> 찾기.
  // self-closing <tag .../> 은 depth 영향 X.
  let depth = 1;
  let i = start;
  const open = '<' + tag;
  const close = '</' + tag + '>';
  while (i < src.length) {
    const o = src.indexOf(open, i);
    const c = src.indexOf(close, i);
    if (c < 0) throw new Error(`unmatched ${close}`);
    if (o >= 0 && o < c) {
      const after = src[o + open.length];
      if (after === '>' || after === ' ' || after === '\n' || after === '\t' || after === '/') {
        // peek if self-closing
        const endO = findEndOfOpenTag(src, o);
        const tagText = src.slice(o, endO + 1).trim();
        if (!tagText.endsWith('/>')) depth++;
        i = endO + 1;
        continue;
      }
      i = o + open.length;
      continue;
    }
    depth--;
    if (depth === 0) return c;
    i = c + close.length;
  }
  throw new Error(`unmatched ${open}`);
}

function transform(src, target) {
  // target = { tag, jsxName, mapper, predicate, classRe }
  const { tag, jsxName, mapper, predicate, classRe } = target;
  const open = '<' + tag;
  let out = '';
  let i = 0;
  let count = 0;
  let skipped = 0;
  while (i < src.length) {
    const idx = src.indexOf(open, i);
    if (idx < 0) { out += src.slice(i); break; }
    const after = src[idx + open.length];
    if (!(after === '>' || after === ' ' || after === '\n' || after === '\t' || after === '/')) {
      out += src.slice(i, idx + open.length);
      i = idx + open.length;
      continue;
    }
    out += src.slice(i, idx);
    const endOpen = findEndOfOpenTag(src, idx);
    const openTag = src.slice(idx, endOpen + 1);
    const m = openTag.match(classRe);
    if (!m) {
      out += openTag;
      i = endOpen + 1;
      continue;
    }
    const cls = m[1];
    if (!predicate(cls)) {
      // mixed with Tailwind etc — skip
      skipped++;
      out += openTag;
      i = endOpen + 1;
      continue;
    }
    const props = mapper(cls);
    let newOpen = openTag.replace(new RegExp(`^<${tag}`), `<${jsxName}`);
    if (props) {
      newOpen = newOpen.replace(/\s*className="[^"]*"/, ' ' + props);
    } else {
      newOpen = newOpen.replace(/\s*className="[^"]*"/, '');
    }
    out += newOpen;
    count++;
    const isSelfClosing = /\/>$/.test(openTag.trim());
    if (isSelfClosing) {
      i = endOpen + 1;
      continue;
    }
    const closePos = findMatchingClose(src, endOpen + 1, tag);
    out += src.slice(endOpen + 1, closePos) + `</${jsxName}>`;
    i = closePos + tag.length + 3; // </tag>
  }
  return { code: out, count, skipped };
}

function ensureImport(src, fileDir, name) {
  // already imported?
  if (new RegExp(`\\b${name}\\b[^;]*from\\s+["'][^"']*\\/theme(\\/components)?["']`).test(src)) return src;
  if (new RegExp(`from\\s+["'][^"']*\\/theme(\\/components)?["'][^;]*\\b${name}\\b`).test(src)) return src;
  const root = path.resolve('src');
  const rel = path.relative(fileDir, path.join(root, 'theme/components'));
  const importPath = rel.startsWith('.') ? rel : './' + rel;
  // merge into existing theme/components import if present
  const existing = src.match(/import\s+\{([^}]+)\}\s+from\s+["'][^"']*\/theme(\/components)?["'];?/);
  if (existing) {
    const items = existing[1].split(',').map((s) => s.trim()).filter(Boolean);
    if (!items.includes(name)) items.push(name);
    items.sort();
    const replaced = existing[0].replace(/\{[^}]+\}/, `{ ${items.join(', ')} }`);
    return src.replace(existing[0], replaced);
  }
  const importLine = `import { ${name} } from "${importPath}";`;
  const importRegex = /^import\s+[^;]+;[ \t]*$/gm;
  let last;
  let m;
  while ((m = importRegex.exec(src))) last = m;
  if (!last) return importLine + '\n' + src;
  const at = last.index + last[0].length;
  return src.slice(0, at) + '\n' + importLine + src.slice(at);
}

const TARGETS = [
  {
    tag: 'button',
    jsxName: 'Button',
    classRe: /className="((?:[^"\\]|\\.)*?\brd-btn[^"]*)"/,
    predicate: isPureBtnClass,
    mapper: mapBtnClass,
    importName: 'Button',
  },
  {
    tag: 'span',
    jsxName: 'Chip',
    classRe: /className="((?:[^"\\]|\\.)*?\brd-chip[^"]*)"/,
    predicate: isPureChipClass,
    mapper: mapChipClass,
    importName: 'Chip',
  },
  // div 형태의 rd-chip (드물지만 존재 가능)
  {
    tag: 'div',
    jsxName: 'Chip',
    classRe: /className="((?:[^"\\]|\\.)*?\brd-chip[^"]*)"/,
    predicate: isPureChipClass,
    mapper: mapChipClass,
    importName: 'Chip',
  },
];

const files = walk('src');
let total = 0;
let skipped = 0;
const perFile = new Map();
for (const f of files) {
  if (f.includes('/theme/')) continue; // 컴포넌트 자기 파일 제외
  if (f.includes('.test.')) continue;
  let src = fs.readFileSync(f, 'utf8');
  if (!/\brd-(btn|chip)\b/.test(src)) continue;
  let fileCount = 0;
  let fileSkipped = 0;
  const importsToAdd = new Set();
  for (const t of TARGETS) {
    const r = transform(src, t);
    if (r.count > 0) {
      src = r.code;
      fileCount += r.count;
      importsToAdd.add(t.importName);
    }
    fileSkipped += r.skipped;
  }
  if (fileCount > 0) {
    for (const name of importsToAdd) src = ensureImport(src, path.dirname(path.resolve(f)), name);
    if (!DRY) fs.writeFileSync(f, src);
    perFile.set(f, { count: fileCount, skipped: fileSkipped });
    total += fileCount;
  }
  skipped += fileSkipped;
}

for (const [f, { count, skipped }] of perFile) {
  console.log(`  ${f}: ${count} converted${skipped ? `, ${skipped} skipped (mixed className)` : ''}`);
}
console.log(`\n${DRY ? '[dry-run] ' : ''}total: ${total} converted, ${skipped} skipped (혼합 className 잔존)`);
