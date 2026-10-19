import "../../pages/group/ClubSurface.css";
import { Button, Text } from "../../theme/components";
import { useToast } from "../../contexts/ToastContext";
import { logClientError } from "../../services/errorLogger";
import { useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RouteTabNav } from "../TabNav";
import { LocalizedLink as Link } from "../LocalizedLink";
import type { Group } from "@shared/types";

interface GroupSubNavProps {
  group: Group;
  isCreator: boolean;
  showDescription?: boolean;
}

export default function GroupSubNav({ group, isCreator, showDescription = true }: GroupSubNavProps) {
  const { showToast } = useToast();
  const { t } = useTranslation("group");
  const { groupId, lang } = useParams();
  const { search } = useLocation();
  const sharedParams = new URLSearchParams(search);
  sharedParams.delete("section");
  sharedParams.delete("copyFrom");
  const sharedSearch = sharedParams.size ? `?${sharedParams.toString()}` : "";
  const base = `/club/${groupId}`;

  const tabs = [
    { to: base, label: t("subNav.news"), end: true },
    { to: `${base}/events`, label: t("subNav.events"), activePaths: [`${base}/meetings`] },
    ...((group.sports ?? [group.discipline ?? "bike"]).includes("bike") ? [{ to: `${base}/rides`, label: t("subNav.rides") }] : []),
    { to: `${base}/week`, label: t("subNav.week") },
    { to: `${base}/members`, label: t("members") },
    ...(isCreator ? [{ to: `${base}/settings`, label: t("subNav.settings") }] : []),
  ];

  return (
    <div data-testid="C1-0" className="club-surface club-subnav mb-6">
      <nav
        aria-label={t("subNav.contextLabel")}
        className="flex flex-wrap items-center mb-3 text-[length:var(--ft-body-size)]"
        style={{ gap: "var(--space-3)", color: "var(--ink-3)" }}
      >
        <Link to="/clubs" style={{ color: "var(--ink-2)" }}>{t("subNav.groupList")}</Link>
        <Link to="/explore/events" style={{ color: "var(--ink-2)" }}>{t("subNav.eventList")}</Link>
      </nav>
      <div className="club-subnav-header">
        <div>
          <Text as="h1" variant="pageTitle" data-testid="C1-0-1">{group.name}</Text>
          {showDescription && group.description && (
            <Text as="p" variant="body" tone="secondary" className="mt-1">{group.description}</Text>
          )}
          <Text as="p" variant="body" tone="secondary" className="mt-1">
            {t("dashboard.memberCount", { count: group.memberCount })}
          </Text>
        </div>
      <Button variant="secondary" size="sm" data-testid="C1-0-4" type="button" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/${lang ?? "ko"}${base}`); showToast(t("invite.copied")); } catch (error) { logClientError("GroupSubNav.share", error, { groupId }); showToast(t("dashboard.posts.actionFailed"), "error"); } }}>{t("button.share")}</Button>
      </div>
      <RouteTabNav tabs={tabs.map(tab => ({ ...tab, specId: "C1-0-2", to: `${tab.to}${sharedSearch}` }))} />

    </div>
  );
}
