import { validActivityNarrativeGrounding } from "../../services/activityNarrativeGrounding";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import type { ActivityNarrativeGrounding, NarrativeGroundingWindow } from "@shared/activity-narrative-grounding";
import { LocalizedLink } from "../LocalizedLink";
import { Text } from "../../theme";

/** Only rendered inside the authenticated owner's narrative. Evidence describes generation time. */
export default function NarrativeComparisonGrounding({ grounding, generatedAt }: {
  grounding: ActivityNarrativeGrounding | null | undefined; generatedAt: number;
}) {
  const { t, i18n } = useTranslation("activity"), location = useLocation();
  const valid = validActivityNarrativeGrounding(grounding, generatedAt);
  const date = (ms: number) => new Intl.DateTimeFormat(i18n.language.startsWith("en") ? "en-US" : "ko-KR", {
    timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short",
  }).format(ms);
  const windowLabel = (window: NarrativeGroundingWindow) => t("ai.grounding.window", {
    from: date(window.fromMs), to: date(window.toMs),
    start: t(window.fromInclusive ? "ai.grounding.included" : "ai.grounding.excluded"),
    end: t(window.toExclusive ? "ai.grounding.excluded" : "ai.grounding.included"),
  });
  return <details className="mt-3">
    <summary>{t("ai.grounding.title")}</summary>
    {!valid ? <Text as="p" variant="bodySmall">{t("ai.grounding.legacy")}</Text> : <div className="space-y-3 mt-2">
      <Text as="p" variant="bodySmall">{t("ai.grounding.intro")}</Text>
      {grounding.blocks.map((block, index) => <section key={`${block.kind}:${index}`}>
        <Text as="h3" variant="bodyMedium">{t(`ai.grounding.kind.${block.kind}`)}</Text>
        <Text as="p" variant="caption">{t(`ai.grounding.basis.${block.basis}`)}</Text>
        {block.window && <Text as="p" variant="bodySmall">{windowLabel(block.window)}</Text>}
        {block.comparisonWindows.map((window, i) => <Text as="p" variant="bodySmall" key={i}>{t("ai.grounding.comparisonWindow", { index: i + 1 })} {windowLabel(window)}</Text>)}
        <Text as="p" variant="bodySmall">{t("ai.grounding.counts", { scanned: block.scannedCount, selected: block.selectedCount })}</Text>
        <Text as="p" variant="bodySmall">{block.missingCount == null ? t("ai.grounding.missingUnknown") : t("ai.grounding.missing", { count: block.missingCount })}</Text>
        <Text as="p" variant="caption">{t(`ai.grounding.coverage.${block.coverage}`)}</Text>
        {block.scanLimit != null && <Text as="p" variant="caption">{t("ai.grounding.limit", { count: block.scanLimit })}</Text>}
        {block.capReached && <Text as="p" variant="caption">{t("ai.grounding.cap")}</Text>}
        <details>
          <summary>{t("ai.grounding.sources", { count: block.sourceCount })}</summary>
          {block.sourcesTruncated && <Text as="p" variant="caption">{t("ai.grounding.sourcesPartial")}</Text>}
          <ul className="space-y-2">
            {block.sources.map((source, i) => <li key={i}>
              <Text as="span" variant="bodySmall">{t(`ai.grounding.sourceKind.${source.kind}`)} {i + 1} </Text>
              {source.activityId && <LocalizedLink to={`/activity/${encodeURIComponent(source.activityId)}`} state={{ returnTo: `${location.pathname}${location.search}${location.hash}` }}>{t("ai.grounding.openSource")}</LocalizedLink>}
              <Text as="p" variant="caption" className="break-all">{source.revision ? t("ai.grounding.revision", { revision: source.revision }) : t("ai.grounding.revisionUnknown")}</Text>
            </li>)}
          </ul>
        </details>
      </section>)}
    </div>}
  </details>;
}
