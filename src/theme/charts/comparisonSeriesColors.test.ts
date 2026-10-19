import { describe, expect, it } from 'vitest';
import tokens from '../../../design-tokens/orider.tokens.json';
import { CHART_PRESENTATION } from './chartPresentation';
import { getComparisonSeriesColors, getComparisonSeriesColor } from './comparisonSeriesColors';

const rgb = (hex: string) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
const luminance = (values: number[]) => values.reduce((sum, value, index) => sum + (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]!, 0);
function effectiveContrast(foreground: string, background: string, alpha: number) {
  const bg = rgb(background), fg = rgb(foreground);
  const blended = fg.map((channel, index) => channel * alpha + bg[index]! * (1 - alpha));
  const first = luminance(blended), second = luminance(bg);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('기록별 주요 선의 합성 대비', () => {
  it.each(['light', 'dark'] as const)('%s 테마의 8색은 실제 plot·페이지 배경 위 3:1 이상을 유지한다', mode => {
    const backgrounds = [tokens.themes.default[mode].colors.surface, tokens.themes.default[mode].colors.background];
    const colors = getComparisonSeriesColors(mode);
    expect(new Set(colors).size).toBe(8);
    for (const color of colors) {
      expect(color).toMatch(/^#[\dA-F]{6}$/i);
      for (const background of backgrounds) expect(effectiveContrast(color, background, CHART_PRESENTATION.lineOpacity), `${mode} ${color} on ${background}`).toBeGreaterThanOrEqual(3);
    }
  });
  it('테마 전환이 기록 index를 바꾸지 않으며 공유 팔레트를 변이하지 않는다', () => {
    expect(getComparisonSeriesColor(0, 'light')).toBe(getComparisonSeriesColors('light')[0]);
    expect(getComparisonSeriesColor(8, 'dark')).toBe(getComparisonSeriesColors('dark')[0]);
    expect(Object.isFrozen(getComparisonSeriesColors('light'))).toBe(true);
  });
});
