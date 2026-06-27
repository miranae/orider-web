import { describe, expect, it } from 'vitest';
import { detectLangFromPath } from './detector';

describe('detectLangFromPath', () => {
  it('returns ko for /ko/...', () => {
    expect(detectLangFromPath('/ko/dashboard')).toBe('ko');
  });
  it('returns en for /en/...', () => {
    expect(detectLangFromPath('/en/activity/123')).toBe('en');
  });
  it('returns null when no prefix', () => {
    expect(detectLangFromPath('/dashboard')).toBeNull();
  });
  it('returns null for unsupported lang', () => {
    expect(detectLangFromPath('/fr/dashboard')).toBeNull();
  });
  it('returns null at root', () => {
    expect(detectLangFromPath('/')).toBeNull();
  });
});
