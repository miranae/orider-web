import EmptyState from "../redesign/states/EmptyState";
import type { Resolve } from "../redesign/states/Resolvable";

interface ChartEmptyStateProps {
  title: string;
  description: string;
  minHeight?: number;
  /** 빈 차트 문구를 누르면 채우는 곳으로(가져오기·연결·기준값 설정). */
  resolve?: Resolve;
}

export default function ChartEmptyState({ title, description, minHeight = 200, resolve }: ChartEmptyStateProps) {
  return (
    <div style={{ minHeight }}>
      <EmptyState title={title} description={description} resolve={resolve} compact />
    </div>
  );
}
