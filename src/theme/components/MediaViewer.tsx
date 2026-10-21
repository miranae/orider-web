import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ZoomOut, ZoomIn, X } from 'lucide-react';
import { useTrainingDialog } from '../../components/training/useTrainingDialog';
import { DEFAULT_THEME } from '../themes';
import { IconButton } from './IconButton';
import { ICON_SIZE } from '../tokens/icon';

export interface MediaViewerProps {
  open: boolean;
  item?: { id: string; url: string; alt: string; caption?: string | null };
  label: string;
  position: string;
  labels: { previous: string; next: string; zoomIn: string; zoomOut: string; close: string };
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  footer?: ReactNode;
}

/** Full-screen media presentation. Selection, loaded inventory and permission remain with the caller. */
export function MediaViewer(props: MediaViewerProps) {
  return props.open && props.item ? createPortal(<MediaViewerPanel {...props} item={props.item} />, document.body) : null;
}
function MediaViewerPanel({ item, label, position, labels, onClose, onPrevious, onNext, footer }: MediaViewerProps & { item: NonNullable<MediaViewerProps['item']> }) {
  const panel = useTrainingDialog(onClose, false);
  const viewport = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [transform, setTransform] = useState({ id: item.id, zoom: 1, x: 0, y: 0 });
  const current = transform.id === item.id ? transform : { id: item.id, zoom: 1, x: 0, y: 0 };
  const frame = useRef(current);
  frame.current = current;
  const naturalSize = useRef<{ id: string; width: number; height: number } | null>(null);
  const gesture = useRef<{ id: string; pointerId: number; x: number; y: number; panX: number; panY: number; zoom: number } | null>(null);
  const dark = DEFAULT_THEME.scheme.dark.colors;
  const style = { '--media-backdrop': dark.background, '--media-foreground': dark.textPrimary,
    '--ink-0': dark.textPrimary, '--ink-1': dark.textSecondary, '--ink-2': dark.textTertiary, '--ink-3': dark.textQuaternary,
    '--bg-1': dark.surface, '--bg-2': dark.surfaceVariant, '--bg-3': dark.surfaceElevated } as CSSProperties;
  const clampPan = useCallback((x: number, y: number, zoom: number) => {
    const width = viewport.current?.clientWidth ?? 0, height = viewport.current?.clientHeight ?? 0;
    const natural = naturalSize.current?.id === item.id ? naturalSize.current : null;
    const fit = natural && natural.width > 0 && natural.height > 0 ? Math.min(width / natural.width, height / natural.height) : 0;
    const limitX = Math.max(0, ((natural?.width ?? 0) * fit * zoom - width) / 2);
    const limitY = Math.max(0, ((natural?.height ?? 0) * fit * zoom - height) / 2);
    return { x: Math.max(-limitX, Math.min(limitX, x)), y: Math.max(-limitY, Math.min(limitY, y)) };
  }, [item.id]);
  const zoomTo = (zoom: number) => { gesture.current = null; const next = { id: item.id, zoom: Math.max(1, Math.min(4, zoom)), x: 0, y: 0 }; frame.current = next; setTransform(next); };
  useEffect(() => {
    gesture.current = null;
    const reset = { id: item.id, zoom: 1, x: 0, y: 0 }; frame.current = reset; setTransform(reset);
    const node = viewport.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      gesture.current = null;
      setTransform(previous => {
        if (previous.id !== item.id) return previous;
        const next = clampPan(previous.x, previous.y, previous.zoom);
        return next.x === previous.x && next.y === previous.y ? previous : { ...previous, ...next };
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [item.id, clampPan]);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      // Preserve browser accessibility zoom and OS pinch gestures; do not also zoom the photo.
      if (event.ctrlKey || event.metaKey || !Number.isFinite(event.deltaY)) return;
      event.preventDefault(); gesture.current = null;
      const computed = getComputedStyle(node);
      const line = Number.parseFloat(computed.lineHeight) || Number.parseFloat(computed.fontSize) || 16;
      const delta = event.deltaY * (event.deltaMode === 1 ? line : event.deltaMode === 2 ? node.clientHeight : 1);
      const previous = frame.current;
      const zoom = Math.max(1, Math.min(4, previous.zoom * Math.exp(-Math.max(-400, Math.min(400, delta)) / 400)));
      const rect = node.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2, y = event.clientY - rect.top - rect.height / 2;
      const next = { id: item.id, zoom, ...clampPan(x - (x - previous.x) * zoom / previous.zoom, y - (y - previous.y) * zoom / previous.zoom, zoom) };
      frame.current = next; setTransform(next);
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [item.id, clampPan]);
  useEffect(() => {
    const cancel = () => { gesture.current = null; };
    window.addEventListener('blur', cancel); window.addEventListener('pointerup', cancel); window.addEventListener('pointercancel', cancel);
    return () => { window.removeEventListener('blur', cancel); window.removeEventListener('pointerup', cancel); window.removeEventListener('pointercancel', cancel); };
  }, []);
  return <div ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className="ds-media-viewer" style={style}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); (event.key === 'ArrowLeft' ? onPrevious : onNext)?.(); }
    }}>
    <div className="ds-media-viewer__toolbar">
      <IconButton variant="ghost" icon={<ZoomIn size={ICON_SIZE.lg} />} aria-label={labels.zoomIn} disabled={current.zoom >= 4} onClick={() => zoomTo(current.zoom + 1)} />
      <IconButton variant="ghost" icon={<ZoomOut size={ICON_SIZE.lg} />} aria-label={labels.zoomOut} disabled={current.zoom <= 1} onClick={() => zoomTo(current.zoom - 1)} />
      <IconButton variant="ghost" data-dialog-initial-focus icon={<X size={ICON_SIZE.lg} />} aria-label={labels.close} onClick={onClose} />
    </div>
    <div className="ds-media-viewer__viewport" ref={viewport} data-zoomed={current.zoom > 1}
      onPointerDown={event => {
        if (event.button !== 0) return;
        gesture.current = { id: item.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: current.x, panY: current.y, zoom: current.zoom };
        event.currentTarget.setPointerCapture?.(event.pointerId); event.preventDefault();
      }}
      onPointerMove={event => {
        const active = gesture.current;
        if (!active || active.id !== item.id || active.pointerId !== event.pointerId || active.zoom <= 1) return;
        setTransform({ id: item.id, zoom: active.zoom, ...clampPan(active.panX + event.clientX - active.x, active.panY + event.clientY - active.y, active.zoom) });
      }}
      onPointerUp={event => {
        const active = gesture.current; gesture.current = null;
        if (!active || active.id !== item.id || active.pointerId !== event.pointerId || active.zoom > 1) return;
        const dx = event.clientX - active.x, dy = event.clientY - active.y;
        if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 2) (dx > 0 ? onPrevious : onNext)?.();
      }}
      onPointerCancel={() => { gesture.current = null; }} onLostPointerCapture={() => { gesture.current = null; }}>
      <img key={item.id} ref={image} onLoad={event => { naturalSize.current = { id: item.id, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }; }} src={item.url} alt={item.alt} draggable={false}
        style={{ transform: `translate(${current.x}px, ${current.y}px) scale(${current.zoom})` }} />
    </div>
    <IconButton variant="ghost" className="ds-media-viewer__previous" icon={<ChevronLeft size={ICON_SIZE.xl} />} aria-label={labels.previous} disabled={!onPrevious} onClick={onPrevious} />
    <IconButton variant="ghost" className="ds-media-viewer__next" icon={<ChevronRight size={ICON_SIZE.xl} />} aria-label={labels.next} disabled={!onNext} onClick={onNext} />
    <div className="ds-media-viewer__footer"><span aria-live="polite">{position}</span>{item.caption && <p>{item.caption}</p>}{footer}</div>
  </div>;
}
