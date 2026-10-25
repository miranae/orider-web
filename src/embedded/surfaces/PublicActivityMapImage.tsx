import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState } from "../../components/redesign";

function MapImageAttempt({ src }: { src: string }) {
  const { t } = useTranslation("activity");
  const [failed, setFailed] = useState(false);
  if (failed) return <ErrorState compact
    title={t("publicDetail.mapImageFailed")}
    description={t("publicDetail.mapImageFailedHint")}
    onRetry={() => setFailed(false)}
  />;
  // Remount the same URL on explicit retry; do not alter signed/static-map URLs.
  return <img className="public-activity-photo" src={src} alt={t("publicDetail.route")} onError={() => setFailed(true)} />;
}

export default function PublicActivityMapImage({ src }: { src: string }) {
  return <MapImageAttempt key={src} src={src} />;
}
