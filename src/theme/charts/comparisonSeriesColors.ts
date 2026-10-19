import tokens from '../../../design-tokens/orider.tokens.json';

export type ComparisonSeriesMode = 'light' | 'dark';
const palette = (variables: Readonly<Record<string, string>>) => Object.freeze(Array.from({ length: 8 }, (_, index) => variables[`--chart-series-${index + 1}`]!));
const palettes = Object.freeze({ light: palette(tokens.themeCssVariables.light), dark: palette(tokens.themeCssVariables.dark) });

/** 정렬된 기록 index를 지도·범례·표·차트에서 같은 색으로 연결한다. */
export function getComparisonSeriesColors(mode: ComparisonSeriesMode): readonly string[] { return palettes[mode]; }
export function getComparisonSeriesColor(index: number, mode: ComparisonSeriesMode): string {
  const colors = palettes[mode];
  return colors[((index % colors.length) + colors.length) % colors.length]!;
}
