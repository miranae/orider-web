#!/usr/bin/env node
// 혼합 className (rd-btn + Tailwind 잡탕) → <Button|Chip className="...rest"> 변환.
//
// 1차 codemod 가 스킵한 "순수 X" 케이스 처리:
//   <button className="rd-btn flex items-center gap-1">
//     → <Button variant="secondary" className="flex items-center gap-1">
//
// 사용: node scripts/codemod-rd-mixed.mjs [--dry]

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

function mapBtnProps(cls) {
  const tokens = cls.split(/\s+/).filter(Boolean);
  const variant = tokens.includes('rd-btn--primary') ? 'primary'
    : tokens.includes('rd-btn--ghost') ? 'ghost'
    : tokens.includes('rd-btn--danger') ? 'danger'
    : 'secondary';
  const size = tokens.includes('rd-btn--sm') ? 'sm' : null;
  const rest = tokens.filter(t => !/^rd-btn(--[\w-]+)?$/.test(t)).join(' ');
  let props = `variant="${variant}"`;
  if (size) props += ` size="${size}"`;
  if (rest) props += ` className="${rest}"`;
  return props;
}

function mapChipProps(cls) {
  const tokens = cls.split(/\s+/).filter(Boolean);
  const variant = tokens.includes('rd-chip--lime') || tokens.includes('rd-chip--aqua') ? 'accent'
    : tokens.includes('rd-chip--amber') ? 'warning'
    : 'default';
  const rest = tokens.filter(t => !/^rd-chip(--[\w-]+)?$/.test(t)).join(' ');
  let props = variant === 'default' ? '' : `variant="${variant}"`;
  if (rest) props += (props ? ' ' : '') + `className="${rest}"`;
  return props;
}

function transformTag(src, tag, jsxName, mapper, classRe) {
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
    const m = openTag.match(classRe);
    if (!m) { out += openTag; i = endOpen + 1; continue; }
    const props = mapper(m[1]);
    let newOpen = openTag.replace(new RegExp(`^<${tag}`), `<${jsxName}`);
    if (props) {
      newOpen = newOpen.replace(/\s*className="[^"]*"/, ' ' + props);
    } else {
      newOpen = newOpen.replace(/\s*className="[^"]*"/, '');
    }
    out += newOpen; count++;
    const isSelfClosing = /\/>$/.test(openTag.trim());
    if (isSelfClosing) { i = endOpen + 1; continue; }
    const closePos = findMatchingClose(src, endOpen + 1, tag);
    out += src.slice(endOpen + 1, closePos) + `</${jsxName}>`;
    i = closePos + tag.length + 3;
  }
  return { code: out, count };
}

function ensureImport(src, fileDir, names) {
  const need = names.filter(n => !new RegExp(`\\b${n}\\b[^;]*from\\s+["'][^"']*\\/theme(\\/components)?["']`).test(src)
    && !new RegExp(`from\\s+["'][^"']*\\/theme(\\/components)?["'][^;]*\\b${n}\\b`).test(src));
  if (need.length === 0) return src;
  const existing = src.match(/import\s+\{([^}]+)\}\s+from\s+(["'])([^"']*\/theme(\/components)?)\2;?/);
  if (existing) {
    const items = existing[1].split(',').map(s => s.trim()).filter(Boolean);
    for (const n of need) if (!items.includes(n)) items.push(n);
    items.sort();
    const replaced = existing[0].replace(/\{[^}]+\}/, `{ ${items.join(', ')} }`);
    return src.replace(existing[0], replaced);
  }
  const root = path.resolve('src');
  const rel = path.relative(fileDir, path.join(root, 'theme/components'));
  const importPath = rel.startsWith('.') ? rel : './' + rel;
  const importLine = `import { ${need.join(', ')} } from "${importPath}";`;
  const importRegex = /^import\s+[^;]+;[ \t]*$/gm;
  let last; let m;
  while ((m = importRegex.exec(src))) last = m;
  if (!last) return importLine + '\n' + src;
  const at = last.index + last[0].length;
  return src.slice(0, at) + '\n' + importLine + src.slice(at);
}

const TARGETS = [
  { tag: 'button', jsx: 'Button', re: /className="((?:[^"\\]|\\.)*?\brd-btn[^"]*)"/, mapper: mapBtnProps, name: 'Button' },
  { tag: 'span', jsx: 'Chip', re: /className="((?:[^"\\]|\\.)*?\brd-chip[^"]*)"/, mapper: mapChipProps, name: 'Chip' },
  { tag: 'div', jsx: 'Chip', re: /className="((?:[^"\\]|\\.)*?\brd-chip[^"]*)"/, mapper: mapChipProps, name: 'Chip' },
];

const files = walk('src');
let totalSites = 0;
let totalFiles = 0;
for (const f of files) {
  if (f.includes('/theme/')) continue;
  if (f.includes('.test.')) continue;
  let src = fs.readFileSync(f, 'utf8');
  if (!/\brd-(btn|chip)\b/.test(src)) continue;
  let fileCount = 0;
  const needNames = new Set();
  for (const t of TARGETS) {
    const r = transformTag(src, t.tag, t.jsx, t.mapper, t.re);
    if (r.count > 0) {
      src = r.code;
      fileCount += r.count;
      needNames.add(t.name);
    }
  }
  if (fileCount > 0) {
    src = ensureImport(src, path.dirname(path.resolve(f)), [...needNames]);
    if (!DRY) fs.writeFileSync(f, src);
    totalFiles++;
    totalSites += fileCount;
    console.log(`  ${f}: ${fileCount}`);
  }
}
console.log(`\n${DRY ? '[dry-run] ' : ''}${totalSites} sites across ${totalFiles} files`);
