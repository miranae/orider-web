import type { KeyboardEventHandler } from 'react';
import { ControlToolbar, ToolbarButton } from './ControlToolbar';

export type ChartRangeMode = 'inspect' | 'select' | 'pan';
export interface ChartRangeControlsLabels { controls: string; selectRange: string; selectRangeShort?: string; panRange: string; reset: string }
export interface ChartRangeControlsProps {
  mode: ChartRangeMode;
  canPan: boolean;
  canReset: boolean;
  labels: ChartRangeControlsLabels;
  onModeChange: (mode: ChartRangeMode) => void;
  onReset: () => void;
  onPanKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
}

/** 세 도구의 공통 표현만 소유한다. 범위와 gesture는 소비자가 관리한다. */
export function ChartRangeControls({ mode, canPan, canReset, labels, onModeChange, onReset, onPanKeyDown }: ChartRangeControlsProps) {
  return <ControlToolbar aria-label={labels.controls}>
    <ToolbarButton aria-label={labels.selectRange} aria-pressed={mode === 'select'} onClick={() => onModeChange(mode === 'select' ? 'inspect' : 'select')}>{labels.selectRangeShort ?? labels.selectRange}</ToolbarButton>
    <ToolbarButton aria-label={labels.panRange} aria-pressed={mode === 'pan' && canPan} disabled={!canPan} onClick={() => onModeChange(mode === 'pan' ? 'inspect' : 'pan')} onKeyDown={onPanKeyDown}>{labels.panRange}</ToolbarButton>
    <ToolbarButton aria-label={labels.reset} disabled={!canReset} onClick={onReset}>{labels.reset}</ToolbarButton>
  </ControlToolbar>;
}
