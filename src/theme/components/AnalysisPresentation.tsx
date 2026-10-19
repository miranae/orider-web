import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { DEFAULT_DIMENS } from '../tokens/dimens';

export interface TimelineSegment { weight: number; color?: string | null }
export interface TimelineBucket { id: string; label: string; weight: number; segments: readonly TimelineSegment[] }
export interface SegmentTimelineRow { id: string; label: string; surface?: 'plain' | 'sheen'; buckets: readonly TimelineBucket[] }
export interface SegmentTimelineProps { rows: readonly SegmentTimelineRow[]; 'aria-label': string; accessibleHint?: string; presentation?: 'timeline' | 'distribution' }
const weight = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;

/** 정렬·시간·존 판정은 호출자가 준비한다. 가중치의 비율만 그린다. */
export function SegmentTimeline({ rows, 'aria-label': label, accessibleHint, presentation = 'timeline' }: SegmentTimelineProps) {
  const interactive = presentation === "timeline";
  const readoutId = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const buckets = rows.flatMap(row => row.buckets.map(bucket => ({ row, bucket, key: JSON.stringify([row.id, bucket.id]) })));
  const index = Math.max(0, buckets.findIndex(entry => entry.key === selected));
  const current = buckets[index];
  return <div className="ds-segment-timeline" data-presentation={presentation} role={interactive ? "group" : "img"} aria-label={label} tabIndex={interactive && buckets.length ? 0 : undefined} aria-describedby={interactive && current ? readoutId : undefined} onKeyDown={event => {
    if (!interactive || !buckets.length) return;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buckets.length - 1 : event.key === 'ArrowLeft' ? Math.max(0, index - 1) : event.key === 'ArrowRight' ? Math.min(buckets.length - 1, index + 1) : null;
    if (next == null) return;
    event.preventDefault(); setSelected(buckets[next]!.key);
  }}>
    {rows.map(row => <div key={row.id} className="ds-segment-timeline__row" data-surface={row.surface}>
      <span className={interactive ? "ds-segment-timeline__label" : "ds-segment-timeline__hint"}>{row.label}</span>
      <div className="ds-segment-timeline__track" role={interactive ? "group" : undefined} aria-label={interactive ? row.label : undefined}>
        {row.buckets.map(bucket => <span key={bucket.id} className="ds-segment-timeline__bucket" style={{ flex: weight(bucket.weight) }} role="img" aria-label={bucket.label} title={bucket.label} data-selected={interactive && current?.key === JSON.stringify([row.id, bucket.id]) || undefined} onClick={interactive ? () => setSelected(JSON.stringify([row.id, bucket.id])) : undefined}>
          {bucket.segments.map((segment, index) => <span key={index} className="ds-segment-timeline__segment" data-missing={segment.color == null || undefined} style={{ flex: weight(segment.weight), backgroundColor: segment.color ?? undefined }} aria-hidden="true" />)}
        </span>)}
      </div>
    </div>)}
    {interactive && current && <p id={readoutId} className="ds-segment-timeline__readout" role="status">{current.row.label}: {current.bucket.label}</p>}
    {accessibleHint && <p className="ds-segment-timeline__hint">{accessibleHint}</p>}
  </div>;
}

function usePlotWidth() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!element) return;
    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, width] as const;
}
const position = (value: number, domain: readonly [number, number]) => Math.min(100, Math.max(0, (value - domain[0]) / (domain[1] - domain[0]) * 100));
const variables = (values: Record<string, string | number>) => values as CSSProperties;

export interface ReferenceGaugeBand { from: number; to: number; color?: string; active?: boolean }
export interface ReferenceGaugeTick { value: number; label: string; compact?: boolean }
export interface ReferenceGaugeProps {
  value: number;
  domain: readonly [number, number];
  bands: readonly ReferenceGaugeBand[];
  ticks: readonly ReferenceGaugeTick[];
  reference?: { value: number; label: string };
  outsideLabel?: string;
  'aria-label': string;
}

/** 읽기 전용 자. 기준값·범위·현재 띠·범위 밖 문구의 의미는 호출자가 결정한다. */
export function ReferenceGauge({ value, domain, bands, ticks, reference, outsideLabel, 'aria-label': label }: ReferenceGaugeProps) {
  const [ref, width] = usePlotWidth();
  const validDomain = Number.isFinite(domain[0]) && Number.isFinite(domain[1]) && domain[1] > domain[0];
  const at = (number: number) => validDomain ? position(number, domain) : 0;
  const validValue = validDomain && Number.isFinite(value);
  const referenceVisible = validDomain && reference && Number.isFinite(reference.value) && reference.value >= domain[0] && reference.value <= domain[1];
  const visibleTicks = width > 0 && width < DEFAULT_DIMENS.paddingM * 21 && ticks.some(tick => tick.compact) ? ticks.filter(tick => tick.compact) : ticks;
  return <div ref={ref} className="ds-reference-gauge" role="img" aria-label={label}>
    {referenceVisible && <span className="ds-reference-gauge__reference-label" aria-hidden="true" style={variables({ '--at': `${at(reference.value)}%` })}>{reference.label}</span>}
    {validValue && outsideLabel && <span className="ds-reference-gauge__outside" aria-hidden="true" style={variables({ '--at': `${at(value)}%`, '--label-shift': at(value) >= 90 ? '-100%' : at(value) <= 10 ? '0%' : '-50%' })}>{outsideLabel}</span>}
    <div className="ds-reference-gauge__track" aria-hidden="true">
      {validDomain && bands.filter(band => Number.isFinite(band.from) && Number.isFinite(band.to) && band.to > band.from).map((band, index) => <span key={index} className="ds-reference-gauge__band" data-active={band.active || undefined} style={{ left: `${at(band.from)}%`, width: `${Math.max(0, at(band.to) - at(band.from))}%`, background: band.active === false ? undefined : band.color }} />)}
      {validDomain && ticks.filter(tick => Number.isFinite(tick.value) && tick.value >= domain[0] && tick.value <= domain[1]).map(tick => <span key={tick.value} className="ds-reference-gauge__tick" style={variables({ '--at': `${at(tick.value)}%` })} />)}
      {referenceVisible && <span className="ds-reference-gauge__reference" style={variables({ '--at': `${at(reference.value)}%` })} />}
      {validValue && <span className="ds-reference-gauge__marker" style={variables({ '--at': `${at(value)}%` })} />}
    </div>
    <div className="ds-reference-gauge__scale" aria-hidden="true">{validDomain && visibleTicks.filter(tick => Number.isFinite(tick.value) && tick.value >= domain[0] && tick.value <= domain[1]).map(tick => <span key={tick.value} style={variables({ '--at': `${at(tick.value)}%` })}>{tick.label}</span>)}</div>
  </div>;
}

export interface BeforeAfterRow {
  id: string; label: ReactNode; ariaLabel: string; from: number; to: number; values: ReactNode; shadeBelowReference?: boolean;
}
export interface BeforeAfterPlotProps {
  rows: readonly BeforeAfterRow[];
  domain: readonly [number, number];
  reference?: { value: number; label: string };
  beforeLabel: ReactNode;
  afterLabel: ReactNode;
}

/** 같은 단위의 준비된 전·후 값을 공통 자에 배치한다. 변화량 계산과 문구는 포함하지 않는다. */
export function BeforeAfterPlot({ rows, domain, reference, beforeLabel, afterLabel }: BeforeAfterPlotProps) {
  const [ref, width] = usePlotWidth();
  const validDomain = Number.isFinite(domain[0]) && Number.isFinite(domain[1]) && domain[1] > domain[0];
  const at = (value: number) => validDomain ? position(value, domain) : 0;
  const referenceVisible = validDomain && reference && Number.isFinite(reference.value) && reference.value >= domain[0] && reference.value <= domain[1];
  return <div className="ds-before-after">
    <ul className="ds-before-after__legend"><li><span className="ds-before-after__key ds-before-after__key--before" aria-hidden="true" />{beforeLabel}</li><li><span className="ds-before-after__key ds-before-after__key--after" aria-hidden="true" />{afterLabel}</li></ul>
    <div className="ds-before-after__rows">
      {rows.map((row, index) => {
        const valid = validDomain && Number.isFinite(row.from) && Number.isFinite(row.to);
        const from = at(row.from), to = at(row.to);
        const collapsed = valid && width > 0 && Math.abs(from - to) / 100 * width < DEFAULT_DIMENS.paddingS;
        return <div key={row.id} className="ds-before-after__row">
          <div className="ds-before-after__label">{row.label}</div>
          <div ref={index === 0 ? ref : undefined} className="ds-before-after__track" role="img" aria-label={row.ariaLabel}>
            {referenceVisible && <>{row.shadeBelowReference && <span className="ds-before-after__shade" style={{ width: `${at(reference.value)}%` }} aria-hidden="true" />}<span className="ds-before-after__reference" style={{ left: `${at(reference.value)}%` }} aria-hidden="true" /></>}
            {valid && <>{!collapsed && <span className="ds-before-after__span" data-decreasing={row.to < row.from || undefined} style={{ left: `${Math.min(from, to)}%`, width: `${Math.abs(from - to)}%` }} aria-hidden="true" />}<span className="ds-before-after__dot ds-before-after__dot--before" data-halo={collapsed || undefined} style={{ left: `${collapsed ? to : from}%` }} aria-hidden="true" /><span className="ds-before-after__dot ds-before-after__dot--after" style={{ left: `${to}%` }} aria-hidden="true" /></>}
          </div>
          <div className="ds-before-after__values">{row.values}</div>
        </div>;
      })}
      {referenceVisible && <div className="ds-before-after__row ds-before-after__row--axis" aria-hidden="true"><span /><div className="ds-before-after__axis"><span style={{ left: `${at(reference.value)}%` }}>{reference.label}</span></div><span /></div>}
    </div>
  </div>;
}
