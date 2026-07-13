import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('public about mobile layout', () => {
  const css = readFileSync(join(process.cwd(), 'public/about/intro.css'), 'utf8');
  const mobileRules = css.slice(css.lastIndexOf('@media (max-width: 600px)'));

  it('keeps headings and nested hero padding compact on narrow screens', () => {
    expect(mobileRules).toMatch(/header h1\s*{[^}]*font-size:\s*1\.85rem/s);
    expect(mobileRules).toMatch(/\.container\s*{[^}]*padding-inline:\s*12px/s);
    expect(mobileRules).toMatch(/\.intro-hero\s*{[^}]*padding:\s*16px/s);
    expect(mobileRules).toMatch(/\.hero-copy\s*{[^}]*padding:\s*0/s);
  });

  it('preserves Korean words while allowing long text to wrap', () => {
    expect(mobileRules).toMatch(/\.hero-copy\s*{[^}]*min-width:\s*0/s);
    expect(mobileRules).toMatch(
      /header h1,[\s\S]*\.container p\s*{[^}]*overflow-wrap:\s*break-word[^}]*word-break:\s*keep-all/s,
    );
    expect(mobileRules).not.toContain('overflow-wrap: anywhere');
  });
});
