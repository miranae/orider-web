import { useTranslation } from "react-i18next";
import { Button } from "../../theme/components";
import { Resolvable, type Resolve } from "../../components/redesign";

interface EmbeddedSurfaceStateProps {
  title: string;
  loading?: boolean;
  message?: string;
  onRetry?: () => void;
  /** 안내 문구를 누르면 상황을 해소하는 곳(로그인 등). 없으면 글자 그대로. */
  resolve?: Resolve;
}

/** Native and embedded surfaces share a readable card for incomplete content. */
export default function EmbeddedSurfaceState({ title, loading = false, message, onRetry, resolve }: EmbeddedSurfaceStateProps) {
  const { t } = useTranslation("common");
  return (
    <section className="orider-embedded-state" aria-label={title}>
      <div className="orider-embedded-state__symbol" aria-hidden="true">{loading ? "◌" : "↻"}</div>
      <h2>{title}</h2>
      <p role={loading ? "status" : "alert"}>
        <Resolvable resolve={loading ? undefined : resolve}>{message ?? t(loading ? "embeddedStatus.loading" : "embeddedStatus.unavailable")}</Resolvable>
      </p>
      {loading ? (
        <div className="orider-embedded-state__skeleton" aria-hidden="true">
          <div /><div /><div />
        </div>
      ) : onRetry && <Button variant="primary" size="sm" onClick={onRetry}>{t("button.retry")}</Button>}
    </section>
  );
}
