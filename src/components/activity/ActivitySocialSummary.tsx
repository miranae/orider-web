import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "../../theme/components";
import type { ActivitySocialSummary as SocialSummary } from "../../hooks/useActivityNarrative";
import type { NarrativeLang } from "../../hooks/useActivityNarrative";
import { retryActivitySocialSummary } from "../../services/activityNarrativeApi";
import StravaSummaryPublishing from "./StravaSummaryPublishing";

interface Props {
  summary?: SocialSummary;
  isActivityOwner: boolean;
  activityId?: string;
  lang?: NarrativeLang;
}

export default function ActivitySocialSummary({ summary: initialSummary, isActivityOwner, activityId, lang = "ko" }: Props) {
  const { t } = useTranslation("activity");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [recovered, setRecovered] = useState<SocialSummary>();
  const [retryState, setRetryState] = useState<"idle" | "loading" | "error">("idle");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const summary = recovered ?? initialSummary;
  const retry = async () => {
    if (!activityId || !isActivityOwner || retryState === "loading") return;
    setRetryState("loading");
    try {
      const result = await retryActivitySocialSummary(activityId, lang);
      if (!mounted.current) return;
      if (!result.socialSummary) { setRetryState("error"); return; }
      setRecovered(result.socialSummary);
      setRetryState("idle");
    } catch {
      if (mounted.current) setRetryState("error");
    }
  };
  if (!summary) return isActivityOwner && activityId ? (
    <section className="mt-4 space-y-3" aria-label={t("socialSummary.title")}>
      <Text variant="body" tone="primary" as="h3">{t("socialSummary.title")}</Text>
      <Text variant="caption" tone="tertiary" as="p">{t("socialSummary.retryHint")}</Text>
      <Button variant="secondary" size="sm" disabled={retryState === "loading"} onClick={() => { void retry(); }}>
        {t(retryState === "loading" ? "socialSummary.retrying" : "socialSummary.retry")}
      </Button>
      {retryState === "error" && <p role="status">{t("socialSummary.retryError")}</p>}
    </section>
  ) : null;
  const impact = isActivityOwner ? summary.fitnessImpact : undefined;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary.shareText);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  return (
    <section className="mt-4 space-y-3" aria-label={t("socialSummary.title")}>
      <Text variant="body" tone="primary" as="h3">{t("socialSummary.title")}</Text>
      <Text variant="body" tone="primary" as="p">{summary.narrative}</Text>
      {summary.achievements.length > 0 && (
        <ul className="space-y-1">
          {summary.achievements.map((achievement) => <li key={achievement.id}>{achievement.text}</li>)}
        </ul>
      )}
      {impact?.status === "available" && (
        <div className="space-y-2">
          <Text variant="caption" tone="tertiary" as="p">{t("socialSummary.integrated")}</Text>
          <dl className="space-y-2">
            {(["ctl", "atl", "tsb"] as const).map((metric) => (
              <div key={metric} className="flex flex-wrap items-baseline justify-between gap-2">
                <dt>{t(`socialSummary.${metric}`)}</dt>
                <dd className="tabular-nums">
                  {impact.before[metric].toFixed(1)} → {impact.after[metric].toFixed(1)}
                  {" "}({impact.delta[metric] > 0 ? "+" : ""}{impact.delta[metric].toFixed(1)})
                </dd>
              </div>
            ))}
          </dl>
          <Text variant="caption" tone="tertiary" as="p">{t("socialSummary.counterfactual")}</Text>
        </div>
      )}
      {impact?.status === "unavailable" && <Text variant="caption" tone="tertiary" as="p">{t("socialSummary.unavailable")}</Text>}
      {isActivityOwner && summary.shareText && (
        <div className="space-y-2">
          <Button variant="secondary" size="sm" onClick={() => { void copy(); }}>{t("socialSummary.copy")}</Button>
          <p role="status">{copyState === "idle" ? "" : t(`socialSummary.${copyState}`)}</p>
        </div>
      )}
      {isActivityOwner && activityId && <StravaSummaryPublishing activityId={activityId} lang={lang} />}
    </section>
  );
}
