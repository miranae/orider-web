import { useEffect, useId, useRef, useState } from 'react';
import { Text } from './Text';
import { TooltipContent } from './TooltipContent';
import './DistributionStrip.css';

export interface DistributionItem { id: string; label: string; detail: string; weight: number; color: string; unlabelled?: boolean }
/** Prepared category weights only; classification and denominator belong to the caller. */
export function DistributionStrip({ label, items }: { label: string; items: readonly DistributionItem[] }) {
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const [active, setActive] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const selected = items.find(item => item.id === active);
  const visible = items.filter(item => Number.isFinite(item.weight) && item.weight > 0);
  useEffect(() => {
    if (!active) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setActive(null); setPinned(false); } };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [active]);
  const handlers = (item: DistributionItem) => ({
    'aria-label': `${item.label} · ${item.detail}`,
    'aria-describedby': active === item.id ? id : undefined,
    onMouseEnter: () => { if (!pinned) setActive(item.id); },
    onMouseLeave: () => { if (!pinned) setActive(null); },
    onFocus: () => { setActive(item.id); setPinned(false); },
    onBlur: () => { setActive(null); setPinned(false); },
    onClick: () => { const close = pinned && active === item.id; setActive(close ? null : item.id); setPinned(!close); },
  });
  return <div ref={root} className="ds-distribution" role="group" aria-label={label} onKeyDown={event => { if (event.key === 'Escape') { setActive(null); setPinned(false); } }}>
    <div className="ds-distribution__header"><Text variant="bodySmall" tone="secondary">{label}</Text>
      <div className="ds-distribution__legend">{items.filter(item => !item.unlabelled).map(item => <button key={item.id} type="button" {...handlers(item)}><span className="ds-distribution__dot" style={{ background: item.color }} />{item.label}</button>)}</div>
    </div>
    <div className="ds-distribution__track">
      {visible.map(item => item.unlabelled ? <span key={item.id} aria-hidden="true" className="ds-distribution__segment" style={{ flexGrow: item.weight }}><span style={{ background: item.color }} /></span> : <button key={item.id} type="button" className="ds-distribution__segment" style={{ flexGrow: item.weight }} {...handlers(item)}><span style={{ background: item.color }} /></button>)}
    </div>
    {selected && <TooltipContent id={id} role="tooltip" title={selected.label} className="ds-distribution__tooltip">{selected.detail}</TooltipContent>}
  </div>;
}
