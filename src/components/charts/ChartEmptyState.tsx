import EmptyState, { type EmptyStateAction } from "../redesign/states/EmptyState";

interface ChartEmptyStateProps {
  title: string;
  description: string;
  minHeight?: number;
  /** 빈 차트를 채우는 곳(가져오기·연결·기준값 설정)으로 가는 행동. */
  actions?: EmptyStateAction[];
}

export default function ChartEmptyState({ title, description, minHeight = 200, actions }: ChartEmptyStateProps) {
  return (
    <div style={{ minHeight }}>
      <EmptyState title={title} description={description} actions={actions} compact />
    </div>
  );
}
