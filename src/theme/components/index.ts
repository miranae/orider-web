/**
 * 디자인 시스템 프리미티브 컴포넌트.
 *
 * 모든 색·치수·타이포 토큰을 내부에서만 소비. 사용처에서 직접 토큰을 만지지 않는다.
 *
 * @example
 * import { Button, Card, Chip, Field, Input, Stat, Stack } from '@/theme/components';
 *
 * <Card title="이번 주 라이드" sub="WEEK 21">
 *   <Stack gap="var(--dim-section-gap)">
 *     <Stat label="총 거리" value={235} unit="km" delta={{ value: '+18%', direction: 'up' }} />
 *     <Button variant="primary">상세 보기</Button>
 *   </Stack>
 * </Card>
 */
export { Button, buttonClass, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { IconButton, type IconButtonProps } from './IconButton';
export { Card, type CardProps, type CardVariant, type CardPadding } from './Card';
export {
  Text,
  type TextProps,
  type TextVariant,
  type TextSize,
  type TextWeight,
  type TextTone,
} from './Text';
export { Chip, type ChipProps, type ChipVariant } from './Chip';
export {
  Input,
  Textarea,
  Select,
  Field,
  type InputProps,
  type TextareaProps,
  type SelectProps,
  type FieldProps,
} from './Input';
export { Switch, type SwitchProps } from './Switch';
export { Stack, type StackProps } from './Stack';
export { Stat, type StatProps, type StatDelta } from './Stat';
export { Alert, type AlertProps, type AlertVariant } from './Alert';
export { Progress, type ProgressProps } from './Progress';
export {
  ChartFrame,
  ChartHeader,
  ChartLegend,
  ChartTooltip,
  ChartGridLine,
  ChartAxisLine,
  type ChartFrameProps,
  type ChartHeaderProps,
  type ChartLegendItem,
  type ChartLegendProps,
  type ChartTooltipProps,
} from './Chart';
export { cn, type ClassValue } from './cn';

export { DropdownSelect, type DropdownSelectProps, type DropdownSelectOption } from './DropdownSelect';

export { ControlToolbar, ToolbarGroup, ToolbarButton, type ControlToolbarProps, type ToolbarGroupProps, type ToolbarButtonProps } from './ControlToolbar';
export { ToggleControls, ToggleButton, ToggleNote, type ToggleControlsProps, type ToggleButtonProps } from './ToggleControls';
export { MapResizeControls, MapNavigation, MapControlButton, type MapResizeControlsProps, type MapNavigationProps, type MapControlButtonProps } from './MapControls';
export { ChartLane, ChartPlot, ChartRangeCaption, ChartValue, CHART_PRESENTATION, CHART_PRESENTATION_DENSITY, type ChartLaneProps, type ChartPlotProps, type ChartValueProps } from './Chart';

export { ComparisonChart, type ComparisonChartProps, type ComparisonChartLane, type ComparisonChartSeries, type ComparisonChartLabels } from './ComparisonChart';

export { Section, type SectionProps } from './Section';
export { DataTable, type DataTableProps, type DataTableColumn } from './DataTable';
export { ComboChart, type ComboChartProps, type ComboChartSeries, type ComboChartAxis } from './ComboChart';

export { SegmentTimeline, ReferenceGauge, BeforeAfterPlot, type TimelineSegment, type TimelineBucket, type SegmentTimelineRow, type SegmentTimelineProps, type ReferenceGaugeBand, type ReferenceGaugeTick, type ReferenceGaugeProps, type BeforeAfterRow, type BeforeAfterPlotProps } from './AnalysisPresentation';

export { SeriesLabel, type SeriesLabelProps } from './Chart';

export { Checkbox, type CheckboxProps } from './Checkbox';
