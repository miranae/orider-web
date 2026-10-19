import { BarElement, type Chart } from 'chart.js';
import { expect, it, vi } from 'vitest';
import { createZoneSurfacePlugin } from './zoneSurface';
vi.mock('chart.js', async importOriginal => await importOriginal());

it('clips sheen to the plot and uses the currently animated bar geometry, skipping unknown positions', () => {
  const canvas = document.createElement('canvas');
  canvas.style.setProperty('--control-sheen-top', 'rgba(255,255,255,.08)');
  canvas.style.setProperty('--control-sheen-bottom', 'rgba(0,0,0,.035)');
  document.body.append(canvas);
  const ctx = {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), roundRect: vi.fn(), fillRect: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };
  const bar = new BarElement();
  const getProps = vi.spyOn(bar, 'getProps').mockReturnValue({ x: 50, y: 30, base: 10, height: 20 });
  const unknown = new BarElement();
  vi.spyOn(unknown, 'getProps').mockReturnValue({ x: null, y: 30, base: 10, height: 20 });
  const chart = { canvas, ctx, chartArea: { left: 10, top: 10, right: 100, bottom: 80 }, data: { datasets: [{}] }, isDatasetVisible: () => true, getDatasetMeta: () => ({ data: [bar, unknown] }) } as unknown as Chart<'bar'>;
  const plugin = createZoneSurfacePlugin();
  plugin.afterDatasetsDraw!.call(plugin, chart, {}, {});
  expect(getProps).toHaveBeenCalledWith(['x', 'y', 'base', 'height'], false);
  expect(ctx.rect).toHaveBeenCalledWith(10, 10, 90, 70);
  expect(ctx.clip.mock.invocationCallOrder[0]).toBeLessThan(ctx.fillRect.mock.invocationCallOrder[0]!);
  expect(ctx.fillRect).toHaveBeenCalledExactlyOnceWith(10, 20, 40, 20);
  expect(ctx.save).toHaveBeenCalledTimes(2);
  expect(ctx.restore).toHaveBeenCalledTimes(2);
  canvas.remove();
});
