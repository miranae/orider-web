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
}

export default function GroupSubNav({ group, isCreator }: GroupSubNavProps) {
  const { showToast } = useToast();
  const { t } = useTranslation("group");
  const { groupId, lang } = useParams();
  const { search } = useLocation();
  const base = `/club/${groupId}`;

  const tabs = [
    { to: base, label: t("subNav.news"), end: true },
    { to: `${base}/events`, label: t("subNav.events") },
    ...((group.sports ?? [group.discipline ?? "bike"]).includes("bike") ? [{ to: `${base}/rides`, label: t("subNav.rides") }] : []),
    { to: `${base}/week`, label: t("subNav.week") },
    { to: `${base}/members`, label: t("members") },
    ...(isCreator ? [{ to: `${base}/settings`, label: t("subNav.settings") }] : []),
  ];

  return (
    <div data-testid="C1-0" className="mb-6">
      <nav
        aria-label={t("subNav.contextLabel")}
        className="flex flex-wrap items-center mb-3 text-[length:var(--fs-sm)]"
        style={{ gap: "var(--space-3)", color: "var(--ink-3)" }}
      >
        <Link to="/clubs" style={{ color: "var(--ink-2)" }}>{t("subNav.groupList")}</Link>
        <Link to="/explore/events" style={{ color: "var(--ink-2)" }}>{t("subNav.eventList")}</Link>
      </nav>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[length:var(--fs-xl)] font-bold" style={{ color: "var(--ink-0)" }}>{group.name}</h1>
          {group.description && (
            <p className="text-[length:var(--fs-sm)] mt-1" style={{ color: "var(--ink-2)" }}>{group.description}</p>
          )}
          <p className="text-[length:var(--fs-xs)] mt-1" style={{ color: "var(--ink-3)" }}>
            {t("dashboard.memberCount", { count: group.memberCount })}
          </p>
        </div>
      </div>
      <RouteTabNav tabs={tabs.map(tab => ({ ...tab, specId: "C1-0-2", to: `${tab.to}${search}` }))} />
      <button data-testid="C1-0-4" type="button" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/${lang ?? "ko"}${base}`); showToast(t("invite.copied")); } catch (error) { logClientError("GroupSubNav.share", error, { groupId }); showToast(t("dashboard.posts.actionFailed"), "error"); } }}>{t("button.share")}</button>
    </div>
  );
}
