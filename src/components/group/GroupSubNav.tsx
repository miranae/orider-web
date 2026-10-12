import { useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RouteTabNav } from "../TabNav";
import { LocalizedLink as Link } from "../LocalizedLink";
import type { Group } from "@shared/types";
import { useAuth } from "../../contexts/AuthContext";
import { useGroupMemberRole, useMyGroups } from "../../hooks/useGroup";
import { useLocalizedNavigate } from "../../hooks/useLocalizedNavigate";
import { Chip, Select } from "../../theme";

interface GroupSubNavProps {
  group: Group;
  isCreator: boolean;
}

export default function GroupSubNav({ group, isCreator }: GroupSubNavProps) {
  const { t } = useTranslation("group");
  const { groupId } = useParams();
  const { pathname } = useLocation();
  const navigate = useLocalizedNavigate();
  const { user } = useAuth();
  const { role, loading: roleLoading } = useGroupMemberRole(groupId, user?.uid);
  const { groups, loading: groupsLoading } = useMyGroups(user?.uid);
  const displayedRole = role ?? (isCreator ? "leader" : null);
  const base = `/group/${groupId}`;
  const currentTab = pathname.split(`${base}/`)[1]?.split("/")[0];
  const roleLabels = {
    leader: t("members.role.leader"),
    "co-leader": t("members.role.coLeader"),
    member: t("members.role.member"),
  };

  const tabs = [
    { to: base, label: t("subNav.overview"), end: true },
    { to: `${base}/rides`, label: t("subNav.rides") },
    { to: `${base}/leaderboard`, label: t("leaderboard") },
    { to: `${base}/members`, label: t("subNav.members") },
    ...(isCreator ? [{ to: `${base}/settings`, label: t("settings") }] : []),
  ];

  return (
    <div className="mb-6">
      <nav
        aria-label={t("subNav.contextLabel")}
        className="flex flex-wrap items-center mb-3 text-[length:var(--fs-sm)]"
        style={{ gap: "var(--space-3)", color: "var(--ink-3)" }}
      >
        <Link to="/groups" style={{ color: "var(--ink-2)" }}>{t("subNav.groupList")}</Link>
        <Link to="/events" style={{ color: "var(--ink-2)" }}>{t("subNav.eventList")}</Link>
      </nav>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex flex-wrap items-center" style={{ gap: "var(--space-3)" }}>
            <h1 className="text-[length:var(--fs-xl)] font-bold" style={{ color: "var(--ink-0)" }}>{group.name}</h1>
            {user && !roleLoading && displayedRole && <Chip>{roleLabels[displayedRole]}</Chip>}
          </div>
          {user && !groupsLoading && groups.length >= 2 && (
            <label className="block mt-3 text-[length:var(--fs-sm)]" style={{ color: "var(--ink-2)" }}>
              {t("subNav.otherGroups")}
              <Select
                value={groupId}
                onChange={(event) => {
                  const tab = currentTab && ["rides", "leaderboard", "members"].includes(currentTab) ? `/${currentTab}` : "";
                  navigate(`/group/${event.target.value}${tab}`);
                }}
              >
                {!groups.some((item) => item.id === groupId) && <option value={groupId}>{group.name}</option>}
                {groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </label>
          )}
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
