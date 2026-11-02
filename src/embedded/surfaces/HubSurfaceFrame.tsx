import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { logClientError } from "../../services/errorLogger";
import EmbeddedSurfaceState from "./EmbeddedSurfaceState";

export interface HubSurfaceProps {
  retryKey: number;
  onReady: () => void;
  onError: (code: string) => void;
}

/** 페이지 청크가 내려와 실제 내용이 처음 마운트되면 한 번만 준비를 알린다. */
function ReadyOnMount({ onReady }: { onReady: () => void }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    onReady();
  }, [onReady]);
  return null;
}

/**
 * 클럽·탐색·검색 임베드 공통 틀. 기존 웹 페이지를 그대로 그리고, 청크 로드·렌더 실패는
 * `surface.error`(surface_load_failed)로 알린 뒤 재시도 카드를 보여 준다.
 */
export default function HubSurfaceFrame({ title, testId, header, retryKey, onReady, onError, children }: HubSurfaceProps & {
  title: string;
  testId: string;
  /** 오류·로딩과 무관하게 항상 보이는 상단(서브탭·검색 폼). */
  header?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation("common");
  return (
    <main className="orider-embedded-surface orider-embedded-hub" data-testid={testId}>
      {header}
      <ErrorBoundary
        key={retryKey}
        onError={(error) => {
          logClientError("embedded.hubSurface", error, { surface: testId });
          onError("surface_load_failed");
        }}
        fallback={({ reset }) => <EmbeddedSurfaceState title={title} message={t("embeddedStatus.unavailable")} onRetry={reset} />}
      >
        <Suspense fallback={<EmbeddedSurfaceState title={title} loading message={t("embeddedStatus.hubLoading")} />}>
          {children}
          <ReadyOnMount onReady={onReady} />
        </Suspense>
      </ErrorBoundary>
    </main>
  );
}
