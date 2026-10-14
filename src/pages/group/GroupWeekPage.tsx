import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useGroup, useGroupMemberRole, useGroupMembers } from "../../hooks/useGroup";
import { useGroupRideStats } from "../../hooks/useGroupRides";
import { canManageGroup } from "../../features/group/groupPermissions";
import GroupSubNav from "../../components/group/GroupSubNav";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/redesign";
import { Button, Card } from "../../theme/components";

type Metric = "distance" | "time" | "elevation";
export default function GroupWeekPage() {
  const { t, i18n } = useTranslation("group");
  const { groupId } = useParams();
  const { user } = useAuth();
  const { role, loading: roleLoading } = useGroupMemberRole(groupId, user?.uid);
  const accessKey = `${user?.uid ?? ""}:${role ?? ""}`;
  const { group, loading: groupLoading, error: groupError } = useGroup(groupId, accessKey);
  const { members } = useGroupMembers(role ? groupId : undefined, undefined, accessKey);
  const { weeklyStats, memberWeekStats, loading, error, retry } = useGroupRideStats(role ? groupId : undefined, accessKey);
  const [metric, setMetric] = useState<Metric>("distance");
  if (groupLoading || roleLoading || loading) return <LoadingSkeleton kind="list" count={5} />;
  if (groupError || error) return <ErrorState title={t("error.loadFailed")} onRetry={retry} />;
  if (!group) return <EmptyState title={t("empty.groupNotFound")} />;
  if (!role) return <Navigate to=".." relative="path" replace />;
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
  const fmt = (value: number, key: Metric) => key === "distance" ? `${(value / 1000).toFixed(1)} km` : key === "elevation" ? `${Math.round(value)} m` : `${Math.floor(value / 3600000)}h ${Math.floor(value % 3600000 / 60000)}m`;
  const entries = { ...Object.fromEntries(members.map(member => [member.id, { distance: 0, time: 0, elevation: 0 }])), ...(memberWeekStats ?? {}) };
  const rows = Object.entries(entries).sort((a, b) => b[1][metric] - a[1][metric]);
  const max = rows[0]?.[1][metric] ?? 0;
  return <div className="space-y-4">
    <GroupSubNav group={group} isCreator={canManageGroup(group, user?.uid, role)} />
    <header data-testid="C5-0"><h2 data-testid="C5-0-1">{t("subNav.week")} · {monday.toLocaleDateString(i18n.language)} – {sunday.toLocaleDateString(i18n.language)}</h2>
    <p data-testid="C5-0-3">{t("week.source")}</p></header>
    <section data-testid="C5-1">{weeklyStats ? <div data-testid="C5-1-1" className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {[[t("dashboard.ranking.distance"), fmt(weeklyStats.totalDistance, "distance")], [t("members"), `${weeklyStats.activeMembers} / ${group.memberCount}`], [t("rides"), weeklyStats.rideCount], [t("dashboard.ranking.time"), fmt(weeklyStats.totalTime, "time")], [t("dashboard.ranking.elevation"), fmt(weeklyStats.totalElevation, "elevation")]].map(([label, value]) => <Card key={label}><p>{label}</p><strong>{value}</strong></Card>)}
    </div> : <p role="status">{t("week.unavailable")}</p>}</section>
    <section data-testid="C5-2"><div className="flex gap-2">{(["distance", "time", "elevation"] as const).map(key => <Button data-testid="C5-2-1" key={key} size="sm" variant={key === metric ? "primary" : "secondary"} aria-pressed={key === metric} onClick={() => setMetric(key)}>{t(`dashboard.ranking.${key}`)}</Button>)}</div>
    {!weeklyStats || weeklyStats.activeMembers === 0 ? <div data-testid="C5-2-3"><EmptyState title={t("week.empty")} /></div> : rows.map(([uid, stats]) => <Card key={uid} className="space-y-2"><Link data-testid="C5-2-2" to={`/athlete/${uid}`}>{members.find(member => member.id === uid)?.profile?.nickname ?? uid}{uid === user?.uid ? ` ${t("dashboard.meIndicator")}` : ""}</Link><p>{fmt(stats[metric], metric)}</p><progress value={stats[metric]} max={max || 1} className="w-full" /></Card>)}
    </section>
  </div>;
}
