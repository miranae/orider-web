import { useTranslation } from "react-i18next";
import { Button } from "../../theme/components";

interface EmbeddedSurfaceStateProps {
  title: string;
  loading?: boolean;
  onRetry?: () => void;
}

/** Native and embedded surfaces share a readable card for incomplete content. */
export default function EmbeddedSurfaceState({ title, loading = false, onRetry }: EmbeddedSurfaceStateProps) {
  const { t } = useTranslation("common");
  return (
    <section className="orider-embedded-state" aria-label={title}>
      <div className="orider-embedded-state__symbol" aria-hidden="true">{loading ? "◌" : "↻"}</div>
      <h2>{title}</h2>
      <p role={loading ? "status" : "alert"}>
        {t(loading ? "embeddedStatus.loading" : "embeddedStatus.unavailable")}
      </p>
      {loading ? (
        <div className="orider-embedded-state__skeleton" aria-hidden="true">
          <div /><div /><div />
        </div>
      ) : onRetry && <Button variant="primary" size="lg" block onClick={onRetry}>{t("button.retry")}</Button>}
    </section>
  );
}
