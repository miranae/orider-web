import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RouteTabNav } from "../TabNav";
import type { Group } from "@shared/types";

interface GroupSubNavProps {
  group: Group;
  isCreator: boolean;
}

export default function GroupSubNav({ group, isCreator }: GroupSubNavProps) {
  const { t } = useTranslation("group");
  const { groupId } = useParams();
  const base = `/group/${groupId}`;

  const tabs = [
    { to: base, label: t("subNav.overview"), end: true },
    { to: `${base}/rides`, label: t("rides") },
    { to: `${base}/leaderboard`, label: t("leaderboard") },
    { to: `${base}/members`, label: t("members") },
    ...(isCreator ? [{ to: `${base}/settings`, label: t("settings") }] : []),
  ];

  return (
    <div className="mb-6">
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
      <RouteTabNav tabs={tabs} />
    </div>
  );
}
