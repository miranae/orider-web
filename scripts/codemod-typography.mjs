#!/usr/bin/env node
// 옛 타이포 유틸 클래스 → <Text variant=...> codemod.
//
// 매핑:
//   .eyebrow → variant="eyebrow"
//   .num     → variant="num"
//   .num-md  → variant="dataMedium"
//   .num-lg  → variant="dataLarge"
//   .num-xl  → variant="dataHero"
//   .unit    → variant="unit"
//   .mono    → variant="mono"
//
// 변환:
//   <span className="eyebrow">X</span>  → <Text variant="eyebrow">X</Text>
//   <div className="num-lg">42</div>    → <Text as="div" variant="dataLarge">42</Text>
//   <span className="eyebrow mb-2">X</span> → <Text variant="eyebrow" className="mb-2">X</Text>
//
// 안전:
//   - 토큰이 className 안에 있고 그 외 클래스 0개 또는 Tailwind 만 — 변환
//   - 토큰 두 개 이상 (예: "num-lg unit") — 첫 번째만 매핑, 나머지는 className 으로 잔존 (드물)
//   - <input>, <button>, <a> 등 의미 강한 태그 — skip (Text 가 부적합)
//
// 사용: node scripts/codemod-typography.mjs [--dry]

import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry');

const CLASS_TO_VARIANT = {
  'eyebrow': 'eyebrow',
  'num': 'num',
  'num-md': 'dataMedium',
  'num-lg': 'dataLarge',
  'num-xl': 'dataHero',
  'unit': 'unit',
  'mono': 'mono',
};

const TYPOGRAPHY_RE = /\b(eyebrow|num(-md|-lg|-xl)?|unit|mono)\b/;

// 의미 변경 위험 태그 — Text 로 변환 X
const SKIP_TAGS = new Set(['input', 'button', 'a', 'label', 'select', 'textarea', 'option', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
// 변환 대상 태그 (`label` 도 포함 — Text `as="label"` 로 form-label 의미 보존)
const TARGET_TAGS = ['span', 'div', 'p', 'strong', 'em', 'small', 'b', 'i', 'label'];

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
  throw new Error('unterminated open tag');
}

function findMatchingClose(src, start, tag) {
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

function transformTag(src, tag) {
  const open = '<' + tag;
  let out = '';
  let i = 0;
  let count = 0;
  while (i < src.length) {
    const idx = src.indexOf(open, i);
    if (idx < 0) { out += src.slice(i); break; }
    const after = src[idx + open.length];
    if (!(after === '>' || after === ' ' || after === '\n' || after === '\t' || after === '/')) {
      out += src.slice(i, idx + open.length); i = idx + open.length; continue;
    }
    out += src.slice(i, idx);
    const endOpen = findEndOfOpenTag(src, idx);
    const openTag = src.slice(idx, endOpen + 1);
    const m = openTag.match(/className="([^"]*)"/);
    if (!m) { out += openTag; i = endOpen + 1; continue; }
    const tokens = m[1].split(/\s+/).filter(Boolean);
    const typoToken = tokens.find(t => CLASS_TO_VARIANT[t] !== undefined);
    if (!typoToken) { out += openTag; i = endOpen + 1; continue; }
    const variant = CLASS_TO_VARIANT[typoToken];
    const rest = tokens.filter(t => t !== typoToken).join(' ');
    let propStr = `variant="${variant}"`;
    if (tag !== 'span') propStr = `as="${tag}" ` + propStr;
    if (rest) propStr += ` className="${rest}"`;
    const newOpen = openTag
      .replace(new RegExp(`^<${tag}`), '<Text')
      .replace(/\s*className="[^"]*"/, ' ' + propStr);
    out += newOpen;
    count++;
    const isSelfClosing = /\/>$/.test(openTag.trim());
    if (isSelfClosing) { i = endOpen + 1; continue; }
    const closePos = findMatchingClose(src, endOpen + 1, tag);
    out += src.slice(endOpen + 1, closePos) + '</Text>';
    i = closePos + tag.length + 3;
  }
  return { code: out, count };
}

function ensureImport(src, fileDir) {
  if (/\bText\b[^;]*from\s+["'][^"']*\/theme(\/components)?["']/.test(src)) return src;
  if (/from\s+["'][^"']*\/theme(\/components)?["'][^;]*\bText\b/.test(src)) return src;
  const existing = src.match(/import\s+\{([^}]+)\}\s+from\s+(["'])([^"']*\/theme(\/components)?)\2;?/);
  if (existing) {
    const items = existing[1].split(',').map(s => s.trim()).filter(Boolean);
    if (!items.includes('Text')) items.push('Text');
    items.sort();
    return src.replace(existing[0], existing[0].replace(/\{[^}]+\}/, `{ ${items.join(', ')} }`));
  }
  const root = path.resolve('src');
  const rel = path.relative(fileDir, path.join(root, 'theme/components'));
  const importPath = rel.startsWith('.') ? rel : './' + rel;
  const importLine = `import { Text } from "${importPath}";`;
  const importRegex = /^import\s+[^;]+;[ \t]*$/gm;
  let last; let m;
  while ((m = importRegex.exec(src))) last = m;
  if (!last) return importLine + '\n' + src;
  const at = last.index + last[0].length;
  return src.slice(0, at) + '\n' + importLine + src.slice(at);
}

const files = walk('src');
let totalSites = 0;
let totalFiles = 0;
for (const f of files) {
  if (f.includes('/theme/')) continue;
  if (f.includes('.test.')) continue;
  let src = fs.readFileSync(f, 'utf8');
  if (!TYPOGRAPHY_RE.test(src)) continue;
  let fileCount = 0;
  for (const tag of TARGET_TAGS) {
    const r = transformTag(src, tag);
    if (r.count > 0) {
      src = r.code;
      fileCount += r.count;
    }
  }
  if (fileCount > 0) {
    src = ensureImport(src, path.dirname(path.resolve(f)));
    if (!DRY) fs.writeFileSync(f, src);
    totalSites += fileCount;
    totalFiles++;
    console.log(`  ${f}: ${fileCount}`);
  }
}
console.log(`\n${DRY ? '[dry-run] ' : ''}${totalSites} sites across ${totalFiles} files`);
