import { useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import { ChartAxisLine, ChartFrame, Card, ChartGridLine, ChartValue, Text } from "../../../theme/components";
import "./FitnessEvidenceTrend.css";

export interface FitnessEvidencePoint {
  key: string;
  label: string;
  value: number;
  unit: string;
  detail?: string;
  x?: number;
}

interface FitnessEvidenceTrendProps {
  title: string;
  points: readonly FitnessEvidencePoint[];
  description?: string;
  color?: string;
  logarithmic?: boolean;
  ticks?: readonly { x: number; label: string }[];
}

/** 저장된 관측값만 그리며, 전체 값과 산출 근거를 포인터·키보드로 확인한다. */
export function FitnessEvidenceTrend({ title, points, description, color = "var(--chart-power)", logarithmic = false, ticks = [] }: FitnessEvidenceTrendProps) {
  const id = useId();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const valid = points.filter(point => Number.isFinite(point.value) && (point.x === undefined || (Number.isFinite(point.x) && (!logarithmic || point.x > 0))));
  const selectedIndex = valid.findIndex(point => point.key === selectedKey);
  const selected = valid[selectedIndex];
  if (!valid.length) return null;

  const values = valid.map(point => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const xs = valid.map((point, index) => logarithmic && point.x !== undefined ? Math.log(point.x) : point.x ?? index);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const visibleTicks = ticks.flatMap(tick => {
    if (!Number.isFinite(tick.x) || (logarithmic && tick.x <= 0)) return [];
    const value = logarithmic ? Math.log(tick.x) : tick.x;
    if (value < xMin || value > xMax) return [];
    return [{ ...tick, position: xMin === xMax ? 210 : 40 + ((value - xMin) / (xMax - xMin)) * 340 }];
  });
  const plotted = valid.map((point, index) => ({
    point,
    x: xMax === xMin ? 210 : 40 + ((xs[index]! - xMin) / (xMax - xMin)) * 340,
    y: max === min ? 80 : 130 - ((point.value - min) / (max - min)) * 100,
  }));
  const chooseAtPointer = (event: MouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const x = ((event.clientX - bounds.left) / bounds.width) * 420;
    const nearest = plotted.reduce((best, candidate) => Math.abs(candidate.x - x) < Math.abs(best.x - x) ? candidate : best);
    setSelectedKey(nearest.point.key);
  };
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "Escape") {
      setSelectedKey(null);
      event.preventDefault();
      return;
    }
    let index: number;
    if (event.key === "Home") index = 0;
    else if (event.key === "End") index = valid.length - 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") index = Math.max(0, (selectedIndex < 0 ? valid.length : selectedIndex) - 1);
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") index = Math.min(valid.length - 1, selectedIndex + 1);
    else return;
    event.preventDefault();
    setSelectedKey(valid[index]!.key);
  };

  return <ChartFrame variant="embedded" className="fitness-evidence-trend">
    {description && <p id={`${id}-description`} className="fitness-evidence-trend__description">{description}</p>}
    <svg viewBox="0 0 420 170" role="group" tabIndex={0} aria-label={title} aria-describedby={[description ? `${id}-description` : null, selected ? `${id}-detail` : null].filter(Boolean).join(" ") || undefined} onFocus={() => setSelectedKey(key => key ?? valid[valid.length - 1]!.key)} onKeyDown={onKeyDown} onMouseMove={chooseAtPointer} onClick={chooseAtPointer}>
      <ChartGridLine x1={40} x2={380} y1={30} y2={30} />
      <ChartGridLine x1={40} x2={380} y1={80} y2={80} />
      <ChartAxisLine x1={40} x2={380} y1={130} y2={130} />
      {visibleTicks.map(tick => <ChartGridLine key={tick.x} x1={tick.position} x2={tick.position} y1={30} y2={130} strokeDasharray="2 3" />)}
      <text x={40} y={18}>{max.toLocaleString()} {valid[0]!.unit}</text>
      <text x={35} y={134} textAnchor="end">{min.toLocaleString()}</text>
      <polyline points={plotted.map(point => `${point.x},${point.y}`).join(" ")} fill="none" stroke={color} strokeWidth={2} />
      {plotted.map(({ point, x, y }) => <circle key={point.key} cx={x} cy={y} r={point.key === selectedKey ? 5 : 3} fill={color} />)}
      {selected && <line x1={plotted[selectedIndex]!.x} x2={plotted[selectedIndex]!.x} y1={24} y2={136} stroke={color} strokeDasharray="3 3" />}
    </svg>
    {visibleTicks.length > 0 ? <div className="fitness-evidence-trend__ticks">
      {visibleTicks.map(tick => <span key={tick.x} style={{ left: `${tick.position / 420 * 100}%` }}>{tick.label}</span>)}
    </div> : <div className="fitness-evidence-trend__range"><span>{valid[0]!.label}</span>{valid.length > 1 && <span>{valid[valid.length - 1]!.label}</span>}</div>}
    {selected && <Card variant="inset" padding="compact" id={`${id}-detail`} role="status" aria-live="polite">
      <ChartValue primary={`${selected.value.toLocaleString()} ${selected.unit}`} secondary={`${selected.label} · ${title}`} />
      {selected.detail && <Text as="p" variant="bodySmall" tone="secondary">{selected.detail}</Text>}
    </Card>}
  </ChartFrame>;
}
