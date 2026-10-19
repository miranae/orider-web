import { createRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox, ControlToolbar, ToolbarGroup, ToolbarButton, ToggleControls, ToggleButton, MapResizeControls, MapNavigation, MapControlButton, ChartLane, ChartPlot, ChartRangeCaption, ChartValue, ChartLegend, ChartTooltip } from './index';

describe('공통 컨트롤', () => {
  it('툴바의 native 키보드 실행·disabled·선택 상태를 전달하고 폼을 제출하지 않는다', async () => {
    const user = userEvent.setup();
    const click = vi.fn(), submit = vi.fn();
    render(<form onSubmit={submit}><ControlToolbar aria-label="차트 조작"><ToolbarGroup>
      <ToolbarButton aria-label="확대" iconOnly onClick={click}>+</ToolbarButton>
      <ToolbarButton aria-label="축소" iconOnly disabled onClick={click}>−</ToolbarButton>
    </ToolbarGroup><ToolbarButton aria-pressed>선택</ToolbarButton></ControlToolbar></form>);
    const zoom = screen.getByRole('button', { name: '확대' });
    zoom.focus();
    await user.keyboard('{Enter}');
    expect(click).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '축소' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '선택' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('선택 토글은 controlled 상태를 유지하고 disabled를 존중한다', () => {
    const changed = vi.fn();
    const view = render(<ToggleControls variant="metric" aria-label="지표"><ToggleButton selected={false} showCheck onClick={changed}>파워</ToggleButton></ToggleControls>);
    const button = screen.getByRole('button', { name: '파워' });
    fireEvent.click(button);
    expect(changed).toHaveBeenCalledOnce();
    expect(button).toHaveAttribute('aria-pressed', 'false');
    view.rerender(<ToggleControls variant="metric" aria-label="지표"><ToggleButton selected showCheck disabled onClick={changed}>파워</ToggleButton></ToggleControls>);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);
    expect(changed).toHaveBeenCalledOnce();
  });

  it('tab 역할은 selected로 상태를 알리고 일반 토글의 pressed 상태와 구분한다', () => {
    const changed = vi.fn();
    const view = render(<ToggleControls role="tablist" aria-label="종목"><ToggleButton role="tab" selected={false} onClick={changed}>러닝</ToggleButton></ToggleControls>);
    const tab = screen.getByRole('tab', { name: '러닝', selected: false });
    expect(tab).not.toHaveAttribute('aria-pressed');
    fireEvent.click(tab);
    expect(changed).toHaveBeenCalledOnce();
    view.rerender(<ToggleControls role="tablist" aria-label="종목"><ToggleButton role="tab" selected>러닝</ToggleButton></ToggleControls>);
    expect(screen.getByRole('tab', { name: '러닝', selected: true })).toBe(tab);
    expect(tab).not.toHaveAttribute('aria-pressed');
    view.rerender(<ToggleControls aria-label="지표"><ToggleButton selected>파워</ToggleButton></ToggleControls>);
    const toggle = screen.getByRole('button', { name: '파워', pressed: true });
    expect(toggle).not.toHaveAttribute('aria-selected');
  });

  it('지도 크기와 카메라 조작 콜백을 분리하고 두 모서리에 같은 크기 상태를 제공한다', () => {
    const resize = vi.fn(), zoom = vi.fn();
    const props = { expanded: false, controlsId: 'route-map', expandLabel: '지도 크게', collapseLabel: '지도 기본 크기', onToggle: resize };
    const view = render(<><MapResizeControls {...props} /><MapNavigation aria-label="지도 위치"><MapControlButton iconOnly aria-label="지도 확대" onClick={zoom}>+</MapControlButton></MapNavigation></>);
    const corners = screen.getAllByRole('button', { name: '지도 크게' });
    expect(corners).toHaveLength(2);
    for (const corner of corners) expect(corner).toHaveAttribute('aria-controls', 'route-map');
    fireEvent.click(corners[0]!);
    expect(resize).toHaveBeenCalledOnce();
    expect(zoom).not.toHaveBeenCalled();
    const zoomButton = screen.getByRole('button', { name: '지도 확대' });
    expect(zoomButton).toHaveAttribute('title', '지도 확대');
    fireEvent.click(zoomButton);
    expect(zoom).toHaveBeenCalledOnce();
    view.rerender(<MapResizeControls {...props} expanded />);
    expect(screen.getAllByRole('button', { name: '지도 기본 크기' })).toEqual(corners);
    corners.forEach(corner => expect(corner).toHaveAttribute('aria-expanded', 'true'));
  });
});

describe('차트 표현', () => {
  it('plot ref·포인터 이벤트·gesture와 결측 안내를 전달하며 캔버스를 유지한다', () => {
    const ref = createRef<HTMLDivElement>(), point = vi.fn();
    const view = render(<ChartLane title="심박수" unit="bpm" aria-label="심박수 차트"><ChartPlot ref={ref} onPointerDown={point} empty="표본 없음"><canvas data-testid="plot" /></ChartPlot></ChartLane>);
    const canvas = screen.getByTestId('plot');
    expect(screen.getByRole('heading', { name: '심박수 bpm' })).toBeInTheDocument();
    fireEvent.pointerDown(ref.current!);
    expect(point).toHaveBeenCalledOnce();
    view.rerender(<ChartLane title="심박수" unit="bpm" aria-label="심박수 차트"><ChartPlot ref={ref} gesture="none"><canvas data-testid="plot" /></ChartPlot></ChartLane>);
    expect(ref.current).toHaveAttribute('data-gesture', 'none');
    expect(screen.getByTestId('plot')).toBe(canvas);
    expect(screen.queryByText('표본 없음')).not.toBeInTheDocument();
  });

  it('범위 갱신과 실제 0·누락 평균을 구분하여 표시한다', () => {
    render(<><ChartRangeCaption>0–10 km</ChartRangeCaption><ChartValue primary={0} secondary="평균 —" /></>);
    expect(screen.getByText('0–10 km')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('평균 —')).toBeInTheDocument();
  });

  it('dot 범례는 선 의미를 추가하지 않고 기록별 레이블을 유지한다', () => {
    const view = render(<ChartLegend marker="dot" aria-label="표시 기록" items={[{ seriesId: 'record', label: '같은 사람 · 기록 2', color: 'var(--chart-power)' }]} />);
    expect(screen.getByRole('list', { name: '표시 기록' })).toHaveTextContent('같은 사람 · 기록 2');
    expect(view.container.querySelector('svg')).toBeNull();
    expect(view.container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});


it('uses native checkbox keyboard selection with an accessible name', async () => {
  function Fixture() { const [checked, setChecked] = useState(false); return <Checkbox aria-label="기록 표시" checked={checked} onChange={event => setChecked(event.target.checked)} />; }
  render(<Fixture />);
  const user = userEvent.setup();
  const checkbox = screen.getByRole('checkbox', { name: '기록 표시' });
  await user.tab();
  expect(checkbox).toHaveFocus();
  await user.keyboard(' ');
  expect(checkbox).toBeChecked();
  await user.click(checkbox);
  expect(checkbox).not.toBeChecked();
});


it('keeps the tooltip label and values while switching edge alignment', () => {
  const view = render(<ChartTooltip label="10월" placement="start">CTL 42</ChartTooltip>);
  const tooltip = screen.getByRole('tooltip');
  expect(tooltip).toHaveTextContent('10월CTL 42');
  expect(tooltip).toHaveAttribute('data-placement', 'start');
  view.rerender(<ChartTooltip label="10월" placement="end">CTL 42</ChartTooltip>);
  expect(tooltip).toHaveAttribute('data-placement', 'end');
  view.rerender(<ChartTooltip label="10월">CTL 42</ChartTooltip>);
  expect(tooltip).not.toHaveAttribute('data-placement');
});
