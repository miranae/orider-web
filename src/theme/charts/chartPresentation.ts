/** Canvas와 표시 집계의 공통 표현 계약. 데이터·축 범위·시계 판단은 기능 계층에 둔다. */
export const CHART_PRESENTATION = Object.freeze({
  metricHeight: 144, backgroundHeight: 72, axisWidth: 54,
  readableLineWidth: 2, lineOpacity: 0.8, backgroundLineOpacity: 0.18, lineTension: 0, fill: false as const,
});
export const CHART_PRESENTATION_DENSITY = Object.freeze({
  pixelsPerPoint: 9, maxPoints: 240, minPoints: 4, edgePoints: 2,
  plotAxisWidth: CHART_PRESENTATION.axisWidth, resizeStep: 7,
});
