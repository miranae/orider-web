import { useTranslation } from "react-i18next";
import { Card } from "../../../theme/components";

export type SkeletonKind = "feed" | "card" | "list" | "chart";

interface LoadingSkeletonProps {
  kind?: SkeletonKind;
  count?: number;
}

const DEFAULT_COUNT: Record<SkeletonKind, number> = {
  feed: 3,
  card: 1,
  list: 5,
  chart: 1,
};

function Shimmer({ height, style }: { height: number | string; style?: React.CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={{
        height,
        // opacity 펄스(GPU 합성) — 옛 rd-shimmer 는 background-position 애니라 비합성이라
        // 첫 로드 중 메인스레드 점유 + 미세 레이아웃시프트(CLS) 를 유발했다 (perf, 2026-06).
        background: "var(--bg-2)",
        animation: "rd-pulse 1.4s ease-in-out infinite",
        borderRadius: "var(--r-md)",
        ...style,
      }}
    />
  );
}

export default function LoadingSkeleton({ kind = "card", count }: LoadingSkeletonProps) {
  const { t } = useTranslation("common");
  const loadingHint = t("label.loadingHint");
  const n = count ?? DEFAULT_COUNT[kind];

  if (kind === "chart") {
    return (
      <Card padding="none" role="status" aria-label={loadingHint} style={{ padding: 'var(--space-4)' }}>
        <Shimmer height={16} style={{ width: "40%", marginBottom: 'var(--space-3)' }} />
        <Shimmer height={240} />
      </Card>
    );
  }

  if (kind === "list") {
    return (
      <div role="status" aria-label={loadingHint} className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="flex items-center" style={{ gap: 'var(--space-3)', padding: "10px 12px", borderBottom: "1px solid var(--line-soft)" }}>
            <Shimmer height={32} style={{ width: 32, borderRadius: "50%" }} />
            <div className="flex-1 flex flex-col" style={{ gap: "var(--space-1-5)" }}>
              <Shimmer height={12} style={{ width: "60%" }} />
              <Shimmer height={10} style={{ width: "30%" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // feed / card — card with header + body + stats row
  return (
    <div role="status" aria-label={loadingHint} className="flex flex-col" style={{ gap: "var(--space-3)" }}>
      {Array.from({ length: n }).map((_, i) => (
        <Card key={i} padding="none" style={{ padding: 'var(--space-4)' }}>
          <div className="flex items-center" style={{ gap: "var(--space-2)", marginBottom: 'var(--space-3)' }}>
            <Shimmer height={40} style={{ width: 40, borderRadius: "50%" }} />
            <div className="flex-1 flex flex-col" style={{ gap: "var(--space-1-5)" }}>
              <Shimmer height={13} style={{ width: "30%" }} />
              <Shimmer height={11} style={{ width: "20%" }} />
            </div>
          </div>
          {kind === "feed" && <Shimmer height={180} style={{ marginBottom: 'var(--space-3)' }} />}
          <div className="flex" style={{ gap: 'var(--space-3)' }}>
            <Shimmer height={14} style={{ flex: 1 }} />
            <Shimmer height={14} style={{ flex: 1 }} />
            <Shimmer height={14} style={{ flex: 1 }} />
          </div>
        </Card>
      ))}
    </div>
  );
}
