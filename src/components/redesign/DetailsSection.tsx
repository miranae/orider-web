/**
 * DetailsSection — progressive disclosure 래퍼 (#400 §1·§4).
 *
 * 데스크톱 /fitness 에서 바이크 개선 액션·라이더 유형·개인 역량·강점/약점 등 2차 분석을
 * 기본 접힘으로 두기 위한 공용 컴포넌트. 네이티브 <details>/<summary> 를 사용해 별도 상태·
 * 접근성 배선 없이 키보드/스크린리더 지원을 그대로 얻는다.
 */
import type { ReactNode } from "react";
import { Text } from "../../theme/components";

export default function DetailsSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      style={{
        marginTop: "var(--space-4)",
        border: "1px solid var(--line-soft)",
        borderRadius: "var(--r-lg)",
        background: "var(--bg-1)",
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          padding: "14px 20px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
        }}
      >
        <Text as="span" variant="label" style={{ color: "var(--ink-1)" }}>
          {title}
        </Text>
      </summary>
      <div style={{ padding: "0 20px 20px" }}>{children}</div>
    </details>
  );
}
