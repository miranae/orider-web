import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Button, DataTable, Section } from './index';

it('names a semantic section from its requested heading level and description', () => {
  render(<Section title="활동 기록" description="원본 기록 기준" headingLevel={3} headingId="analysis-topic-summary" actions={<Button>더 보기</Button>}><p>구간 요약</p></Section>);
  const section = screen.getByRole('region', { name: '활동 기록' });
  expect(within(section).getByRole('heading', { level: 3 })).toHaveTextContent('활동 기록');
  expect(section).toHaveAccessibleDescription('원본 기록 기준');
  expect(section).toHaveAttribute('aria-labelledby', 'analysis-topic-summary');
  expect(within(section).getByRole('heading')).toHaveAttribute('id', 'analysis-topic-summary');
  expect(within(section).getByRole('button', { name: '더 보기' })).toBeInTheDocument();
});

it('keeps native table headers while a consumer changes sort order, loading and empty states', () => {
  function TableFixture() {
    const [descending, setDescending] = useState(false);
    const [state, setState] = useState('ready');
    const rows = [{ id: 'zero', name: '정지 기록', power: 0 }, { id: 'missing', name: '센서 없음', power: null }];
    return <><Button onClick={() => setState('loading')}>불러오기</Button><Button onClick={() => setState('empty')}>비우기</Button><DataTable
      caption="선택한 기록의 파워" rows={state === 'empty' ? [] : descending ? [...rows].reverse() : rows} rowKey={row => row.id}
      loading={state === 'loading'} loadingLabel="기록 읽는 중" emptyLabel="기록 없음"
      columns={[{ id: 'name', rowHeader: true, header: <Button onClick={() => setDescending(value => !value)}>기록 정렬</Button>, sortDirection: descending ? 'descending' : 'ascending', cell: row => row.name }, { id: 'power', header: '파워 (W)', align: 'end', cell: row => row.power ?? '—' }]} /></>;
  }
  render(<TableFixture />);
  const table = screen.getByRole('table', { name: '선택한 기록의 파워' });
  expect(within(table).getByRole('rowheader', { name: '정지 기록' })).toBeInTheDocument();
  expect(within(table).getByRole('cell', { name: '0' })).toBeInTheDocument();
  expect(within(table).getByRole('cell', { name: '—' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '기록 정렬' }));
  expect(within(table).getAllByRole('rowheader').map(row => row.textContent)).toEqual(['센서 없음', '정지 기록']);
  expect(within(table).getByRole('columnheader', { name: '기록 정렬' })).toHaveAttribute('aria-sort', 'descending');
  fireEvent.click(screen.getByRole('button', { name: '불러오기' }));
  expect(table).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('기록 읽는 중');
  expect(table).not.toContainElement(screen.getByRole('status'));
  expect(table).toHaveAccessibleDescription('기록 읽는 중');
  fireEvent.click(screen.getByRole('button', { name: '비우기' }));
  expect(screen.getByRole('status')).toHaveTextContent('기록 없음');
  expect(table).not.toContainElement(screen.getByRole('status'));
  expect(table).toHaveAccessibleDescription('기록 없음');
  expect(within(table).getAllByRole('columnheader')).toHaveLength(2);
});


it('keeps a compact table named by its caption when a surrounding section already shows the title', () => {
  const props = { caption: '기록 비교', rows: [{ id: 'a', name: '기록 A' }], rowKey: (row: { id: string }) => row.id, emptyLabel: '기록 없음', columns: [{ id: 'name', header: '이름', rowHeader: true, cell: (row: { name: string }) => row.name }] };
  const { rerender } = render(<DataTable {...props} />);
  const table = screen.getByRole('table', { name: '기록 비교' });
  expect(table).toHaveAttribute('data-row-header-width', 'default');
  rerender(<DataTable {...props} rowHeaderWidth="compact" captionVisibility="screen-reader" />);
  expect(screen.getByRole('table', { name: '기록 비교' })).toBe(table);
  expect(screen.getByRole('region', { name: '기록 비교' })).toContainElement(table);
  expect(table).toHaveAttribute('data-row-header-width', 'compact');
  expect(table.querySelector('caption')).toHaveAttribute('data-visibility', 'screen-reader');
  expect(within(table).getByRole('rowheader', { name: '기록 A' })).toBeInTheDocument();
});
