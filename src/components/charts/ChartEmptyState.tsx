import EmptyState from "../redesign/states/EmptyState";

interface ChartEmptyStateProps {
  title: string;
  description: string;
  minHeight?: number;
}

export default function ChartEmptyState({ title, description, minHeight = 200 }: ChartEmptyStateProps) {
  return (
    <div style={{ minHeight }}>
      <EmptyState title={title} description={description} compact />
    </div>
  );
}
