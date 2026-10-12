import { useTranslation } from "react-i18next";
import { Button } from "../../theme/components";
import type { ActivityFeedScope } from "../../hooks/useActivities";
import type { RelationshipScope } from "./feedRelationshipScope";

export default function FeedScopeSelector({ scope, feedScope, onScopeChange, onFeedScopeChange }: {
  scope: RelationshipScope;
  feedScope: ActivityFeedScope;
  onScopeChange: (scope: RelationshipScope) => void;
  onFeedScopeChange: (scope: ActivityFeedScope) => void;
}) {
  const { t } = useTranslation("dashboard");
  return <div className="flex flex-col gap-2">
    <div role="group" aria-label={t("feed.relationship.label")} className="flex flex-wrap gap-1">
      {(["personal", "club", "public"] as const).map((value) => <Button key={value} size="sm" variant={scope === value ? "primary" : "secondary"} aria-pressed={scope === value} title={value === "public" ? t("feed.countTooltip") : undefined} onClick={() => onScopeChange(value)}>{t(`feed.relationship.${value}`)}</Button>)}
    </div>
    {scope === "personal" && <div role="group" aria-label={t("feed.filter.label")} className="flex gap-1">
      {(["self", "friends"] as const).map((value) => <Button key={value} size="sm" variant={feedScope === value ? "primary" : "secondary"} aria-pressed={feedScope === value} onClick={() => onFeedScopeChange(value)}>{value === "self" ? t("feed.relationship.self") : t("feed.filter.friends")}</Button>)}
    </div>}
  </div>;
}
