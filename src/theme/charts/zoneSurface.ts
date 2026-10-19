import type { CSSProperties } from 'react';
import { BarElement, type Plugin } from 'chart.js';
import { DEFAULT_DIMENS } from '../tokens/dimens';

/** 존의 원래 색·폭 위에만 명암을 더한다. 존 사이의 색을 보간하지 않는다. */
export const zoneSurfaceStyle: CSSProperties = {
  backgroundImage: 'linear-gradient(to bottom, var(--control-sheen-top), transparent 42%, var(--control-sheen-bottom))',
  boxShadow: 'inset 0 var(--dim-divider-thickness) 0 var(--control-edge-highlight)',
};

/** DOM과 같은 토큰을 기존 수평 막대 내부에만 합성한다. 데이터/기본색은 변경하지 않는다. */
export function createZoneSurfacePlugin(): Plugin<'bar'> {
  return {
    id: 'zoneSurface',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const tokens = getComputedStyle(chart.canvas);
      const top = tokens.getPropertyValue('--control-sheen-top').trim();
      const bottom = tokens.getPropertyValue('--control-sheen-bottom').trim();
      if (!top || !bottom) return;
      ctx.save();
      const { left, top: chartTop, right, bottom: chartBottom } = chart.chartArea;
      ctx.beginPath(); ctx.rect(left, chartTop, right - left, chartBottom - chartTop); ctx.clip();
      chart.data.datasets.forEach((_, index) => {
        if (!chart.isDatasetVisible(index)) return;
        for (const element of chart.getDatasetMeta(index).data) {
          if (!(element instanceof BarElement)) continue;
          const { x, y, base, height } = element.getProps(['x', 'y', 'base', 'height'], false);
          if (typeof x !== 'number' || typeof y !== 'number' || typeof base !== 'number' || typeof height !== 'number' || ![x, y, base, height].every(Number.isFinite) || x === base || height <= 0) continue;
          const left = Math.min(x, base), width = Math.abs(x - base), upper = y - height / 2;
          const gradient = ctx.createLinearGradient(0, upper, 0, upper + height);
          gradient.addColorStop(0, top); gradient.addColorStop(0.42, 'transparent'); gradient.addColorStop(1, bottom);
          ctx.save(); ctx.beginPath(); ctx.roundRect(left, upper, width, height, Math.min(DEFAULT_DIMENS.cornerRadiusS, width / 2, height / 2)); ctx.clip();
          ctx.fillStyle = gradient; ctx.fillRect(left, upper, width, height); ctx.restore();
        }
      });
      ctx.restore();
    },
  };
}
