import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';
import ko from './ko/group.json';
import en from './en/group.json';

describe('club copy interpolation', () => {
  it.each([['ko',ko],['en',en]] as const)('%s uses i18next placeholders throughout club copy', async (lang, group) => {
    const instance = createInstance();
    await instance.init({ lng:lang, resources:{[lang]:{group}}, defaultNS:'group', keySeparator:false });
    for (const [key,value] of Object.entries(group)) {
      expect(value, key).not.toMatch(/(?<!\{)\{[A-Za-z][A-Za-z0-9_]*\}(?!\})/);
    }
    expect(instance.t('ridePage.participants',{count:3})).toContain('3');
    expect(instance.t('ridePage.participants',{count:3})).not.toContain('{count}');
    expect(instance.t('ridePage.header',{date:'Oct 16'})).toContain('Oct 16');
  });
});
