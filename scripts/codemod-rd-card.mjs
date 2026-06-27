#!/usr/bin/env node
// rd-card → <Card padding="none"> codemod.
//
// rd-card 는 padding 무 (사용자가 p-* Tailwind 로 추가). <Card> 는 기본 16px →
// padding="none" 로 변환해서 기존 시각 보존. 추가 className 은 보존.
//
// 안전:
//   - rd-card 가 className 안 어디든 등장하면 변환 (위치 무관)
//   - <div>/<span>/<a> 등 모든 host 태그 대상 (실무에서 rd-card 가 button 에 안 쓰임)
//   - rd-card 외 추가 클래스는 className prop 으로 보존
//   - 닫는 태그 매칭 추적
//
// 사용: node scripts/codemod-rd-card.mjs [--dry]

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

const TAGS = ['div', 'span', 'a', 'article', 'section', 'li', 'aside'];

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
      out += src.slice(i, idx + open.length);
      i = idx + open.length;
      continue;
    }
    out += src.slice(i, idx);
    const endOpen = findEndOfOpenTag(src, idx);
    const openTag = src.slice(idx, endOpen + 1);
    const m = openTag.match(/className="([^"]*\brd-card\b[^"]*)"/);
    if (!m) {
      out += openTag;
      i = endOpen + 1;
      continue;
    }
    // remove rd-card token from className, preserve rest
    const remaining = m[1]
      .split(/\s+/)
      .filter((t) => t && t !== 'rd-card')
      .join(' ');
    let propStr = 'padding="none"';
    if (remaining) propStr += ` className="${remaining}"`;
    let newOpen = openTag
      .replace(new RegExp(`^<${tag}`), '<Card')
      .replace(/\s*className="[^"]*"/, ' ' + propStr);
    out += newOpen;
    count++;
    const isSelfClosing = /\/>$/.test(openTag.trim());
    if (isSelfClosing) {
      i = endOpen + 1;
      continue;
    }
    const closePos = findMatchingClose(src, endOpen + 1, tag);
    out += src.slice(endOpen + 1, closePos) + '</Card>';
    i = closePos + tag.length + 3;
  }
  return { code: out, count };
}

function ensureImport(src, fileDir) {
  // Card already imported from theme/components?
  if (/\bCard\b[^;]*from\s+["'][^"']*\/theme(\/components)?["']/.test(src)) return src;
  if (/from\s+["'][^"']*\/theme(\/components)?["'][^;]*\bCard\b/.test(src)) return src;
  // merge into existing theme import
  const existing = src.match(/import\s+\{([^}]+)\}\s+from\s+(["'])([^"']*\/theme(\/components)?)\2;?/);
  if (existing) {
    const items = existing[1].split(',').map((s) => s.trim()).filter(Boolean);
    if (!items.includes('Card')) items.push('Card');
    items.sort();
    const replaced = existing[0].replace(/\{[^}]+\}/, `{ ${items.join(', ')} }`);
    return src.replace(existing[0], replaced);
  }
  const root = path.resolve('src');
  const rel = path.relative(fileDir, path.join(root, 'theme/components'));
  const importPath = rel.startsWith('.') ? rel : './' + rel;
  const importLine = `import { Card } from "${importPath}";`;
  const importRegex = /^import\s+[^;]+;[ \t]*$/gm;
  let last;
  let m;
  while ((m = importRegex.exec(src))) last = m;
  if (!last) return importLine + '\n' + src;
  const at = last.index + last[0].length;
  return src.slice(0, at) + '\n' + importLine + src.slice(at);
}

const files = walk('src');
let totalFiles = 0;
let totalSites = 0;
for (const f of files) {
  if (f.includes('/theme/')) continue;
  if (f.includes('.test.')) continue;
  let src = fs.readFileSync(f, 'utf8');
  if (!/\brd-card\b/.test(src)) continue;
  let fileCount = 0;
  for (const tag of TAGS) {
    const r = transformTag(src, tag);
    if (r.count > 0) {
      src = r.code;
      fileCount += r.count;
    }
  }
  if (fileCount > 0) {
    src = ensureImport(src, path.dirname(path.resolve(f)));
    if (!DRY) fs.writeFileSync(f, src);
    totalFiles++;
    totalSites += fileCount;
    console.log(`  ${f}: ${fileCount} rd-card → <Card padding="none">`);
  }
}

const remaining = `(잔존 rd-card grep 으로 확인하세요)`;
console.log(`\n${DRY ? '[dry-run] ' : ''}${totalSites} sites across ${totalFiles} files ${remaining}`);
