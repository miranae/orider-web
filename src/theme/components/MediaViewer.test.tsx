import { useState } from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/utils/renderWithProviders';
import { MediaViewer } from './MediaViewer';
const labels = { previous: 'Previous', next: 'Next', zoomIn: 'Zoom in', zoomOut: 'Zoom out', close: 'Close viewer' };
function Example() {
  const [open, setOpen] = useState(false), [index, setIndex] = useState(0);
  return <><button onClick={() => setOpen(true)}>Open photos</button><MediaViewer open={open} item={{ id: String(index), url: `https://images.example/${index}.jpg`, alt: `Photo ${index}` }} label="Photos" position={`${index + 1} / 2`} labels={labels}
    onClose={() => setOpen(false)} onPrevious={() => setIndex(value => 1 - value)} onNext={() => setIndex(value => 1 - value)} /></>;
}
beforeEach(() => vi.stubGlobal('PointerEvent', MouseEvent));
afterEach(() => vi.unstubAllGlobals());
it('opens only when requested, locks background scroll, traps focus and restores the trigger on Escape', () => {
  renderWithProviders(<Example />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const trigger = screen.getByRole('button', { name: 'Open photos' }); trigger.focus(); fireEvent.click(trigger);
  expect(document.body.style.overflow).toBe('hidden');
  const close = screen.getByRole('button', { name: 'Close viewer' }); expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: 'Tab' });
  // The final arrow is last in dialog DOM order: Tab wraps to the first enabled zoom control.
  const next = screen.getByRole('button', { name: 'Next' }); next.focus(); fireEvent.keyDown(next, { key: 'Tab' });
  expect(screen.getByRole('button', { name: 'Zoom in' })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).not.toBe('hidden');
});
it('clamps zoomed panning using natural image dimensions, reclamps after resize and resets on photo changes', () => {
  let resize = () => {};
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} });
  renderWithProviders(<Example />); fireEvent.click(screen.getByRole('button', { name: 'Open photos' }));
  const image = screen.getByRole('img'), viewport = image.parentElement!;
  Object.defineProperties(image, { naturalWidth: { value: 100 }, naturalHeight: { value: 50 } });
  Object.defineProperties(viewport, { clientWidth: { value: 400, configurable: true }, clientHeight: { value: 300 } });
  fireEvent.load(image);
  expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  fireEvent.pointerDown(viewport, { clientX: 0, clientY: 0, button: 0 }); fireEvent.pointerMove(viewport, { clientX: 1000, clientY: 1000 });
  expect(image.style.transform).toBe('translate(200px, 50px) scale(2)');
  Object.defineProperty(viewport, 'clientWidth', { value: 200 }); act(() => resize());
  expect(image.style.transform).toBe('translate(100px, 0px) scale(2)');
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
  expect(screen.getByRole('img')).toHaveAttribute('alt', 'Photo 1');
  expect(screen.getByRole('img').style.transform).toBe('translate(0px, 0px) scale(1)');
  expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });
  expect(screen.getByRole('img').style.transform).toBe('translate(0px, 0px) scale(1)');
});
it('separates normal swipes from zoomed panning and cancels interrupted gestures', () => {
  renderWithProviders(<Example />); fireEvent.click(screen.getByRole('button', { name: 'Open photos' }));
  const viewport = screen.getByRole('img').parentElement!;
  fireEvent.pointerDown(viewport, { clientX: 100, clientY: 0, button: 0 }); fireEvent.pointerUp(viewport, { clientX: 0, clientY: 0 });
  expect(screen.getByRole('img')).toHaveAttribute('alt', 'Photo 1');
  fireEvent.pointerDown(viewport, { clientX: 100, button: 0 }); fireEvent.pointerCancel(viewport); fireEvent.pointerUp(viewport, { clientX: 0 });
  expect(screen.getByRole('img')).toHaveAttribute('alt', 'Photo 1');
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  fireEvent.pointerDown(viewport, { clientX: 100, button: 0 }); fireEvent.pointerUp(viewport, { clientX: 0 });
  expect(screen.getByRole('img')).toHaveAttribute('alt', 'Photo 1');
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  expect(screen.getByRole('img')).toHaveAttribute('alt', 'Photo 0');
});

it('zooms smoothly around the wheel cursor, normalizes wheel modes, clamps bounds and removes its listener', () => {
  const view = renderWithProviders(<Example />); fireEvent.click(screen.getByRole('button', { name: 'Open photos' }));
  const image = screen.getByRole('img'), viewport = image.parentElement!;
  Object.defineProperties(image, { naturalWidth: { value: 400 }, naturalHeight: { value: 300 } });
  Object.defineProperties(viewport, { clientWidth: { value: 400 }, clientHeight: { value: 300 } });
  viewport.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON() {} });
  fireEvent.load(image);
  const scroll = new WheelEvent('wheel', { deltaY: -100, clientX: 300, clientY: 150, cancelable: true });
  act(() => { viewport.dispatchEvent(scroll); });
  expect(scroll.defaultPrevented).toBe(true);
  const match = image.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/)!;
  const zoom = Number(match[3]); expect(zoom).toBeGreaterThan(1); expect(zoom).toBeLessThan(2);
  expect(Number(match[1])).toBeCloseTo(100 * (1 - zoom)); expect(Number(match[2])).toBe(0);
  fireEvent.pointerDown(viewport, { clientX: 200, clientY: 150, button: 0 }); fireEvent.pointerMove(viewport, { clientX: 240, clientY: 150 }); fireEvent.pointerUp(window);
  const panned = image.style.transform;
  expect(Number(panned.match(/translate\(([-\d.]+)px/)![1])).toBeCloseTo(Number(match[1]) + 40);
  fireEvent.pointerMove(viewport, { clientX: 300, clientY: 150 }); expect(image.style.transform).toBe(panned);
  const browserZoom = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true });
  act(() => { viewport.dispatchEvent(browserZoom); });
  expect(browserZoom.defaultPrevented).toBe(false); expect(image.style.transform).toContain(`scale(${zoom})`);
  for (let index = 0; index < 4; index++) fireEvent.wheel(viewport, { deltaY: -10, deltaMode: 2, clientX: 200, clientY: 150 });
  expect(image.style.transform).toContain('scale(4)');
  for (let index = 0; index < 8; index++) fireEvent.wheel(viewport, { deltaY: 100, deltaMode: 1, clientX: 200, clientY: 150 });
  expect(image.style.transform).toBe('translate(0px, 0px) scale(1)');
  const removed = vi.spyOn(viewport, 'removeEventListener'); view.unmount();
  expect(removed).toHaveBeenCalledWith('wheel', expect.any(Function));
});
