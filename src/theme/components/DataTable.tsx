import { useId, type CSSProperties, type ReactNode } from 'react';

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  align?: 'start' | 'end';
  rowHeader?: boolean;
  sortDirection?: 'ascending' | 'descending' | 'none';
}
export interface DataTableProps<Row> {
  caption: string;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  emptyLabel: string;
  loading?: boolean;
  loadingLabel?: string;
  stickyFirstColumn?: boolean;
  rowHeaderWidth?: 'default' | 'compact' | 'selectable';
  captionVisibility?: 'visible' | 'screen-reader';
}

/** 표의 의미와 값은 호출자가 결정한다. 스크롤과 제목 표현만 공통화한다. */
export function DataTable<Row>({ caption, columns, rows, rowKey, emptyLabel, loading = false, loadingLabel, stickyFirstColumn = true, rowHeaderWidth = 'default', captionVisibility = 'visible' }: DataTableProps<Row>) {
  const captionId = useId();
  const statusId = useId();
  const hasStatus = loading || rows.length === 0;
  return <div className="ds-data-table-frame"><div className="ds-data-table-scroll" role="region" aria-labelledby={captionId} tabIndex={0}>
    <table className="ds-data-table" data-sticky-first={stickyFirstColumn || undefined} data-row-header-width={rowHeaderWidth} aria-busy={loading || undefined} aria-describedby={hasStatus ? statusId : undefined}
      style={{ '--ds-table-columns': columns.length } as CSSProperties}>
      <caption id={captionId} data-visibility={captionVisibility}>{caption}</caption>
      <thead><tr>{columns.map(column => <th key={column.id} scope="col" aria-sort={column.sortDirection} data-align={column.align ?? 'start'}>{column.header}</th>)}</tr></thead>
      <tbody>{hasStatus ? null : rows.map(row => <tr key={rowKey(row)}>{columns.map(column => {
        const Cell = column.rowHeader ? 'th' : 'td';
        return <Cell key={column.id} scope={column.rowHeader ? 'row' : undefined} data-align={column.align ?? 'start'}>{column.cell(row)}</Cell>;
      })}</tr>)}</tbody>
    </table>
  </div>{hasStatus && <div id={statusId} className="ds-data-table__status" role="status">{loading ? loadingLabel ?? emptyLabel : emptyLabel}</div>}</div>;
}
