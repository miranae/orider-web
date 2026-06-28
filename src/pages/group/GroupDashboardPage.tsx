import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import { useGroup, useGroupMembers } from "../../hooks/useGroup";
import { useGroupRides } from "../../hooks/useGroupRides";
import GroupSubNav from "../../components/group/GroupSubNav";
import RideCard from "../../components/group/RideCard";
import Avatar from "../../components/Avatar";
import { EmptyState, LoadingSkeleton } from "../../components/redesign";
import { Card, Chip, Text, buttonClass } from "../../theme/components";

interface UpcomingEvent {
  id: string;
  name: string;
  startTime: number;
  status: string;
}

export default function GroupDashboardPage() {
  const { t } = useTranslation("group");
  const { groupId } = useParams();
  const { user } = useAuth();
  const { group, loading: groupLoading } = useGroup(groupId);
  const { members, loading: membersLoading } = useGroupMembers(groupId, 8);

  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const { rides, loading: ridesLoading } = useGroupRides(memberIds, 5);

  // 다가오는 그룹 이벤트
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  useEffect(() => {
    if (!groupId) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(firestore, "events"),
            where("info.groupId", "==", groupId),
            where("info.status", "in", ["OPEN", "LIVE"]),
            orderBy("info.startTime", "asc"),
            limit(5)
          )
        );
        const list: UpcomingEvent[] = snap.docs.map((d) => {
          const data = d.data();
          const info = data.info ?? {};
          const startTime =
            typeof info.startTime === "number" ? info.startTime :
            info.startTime?._seconds ? info.startTime._seconds * 1000 :
            info.startTime?.seconds ? info.startTime.seconds * 1000 : 0;
          return {
            id: d.id,
            name: info.name ?? t("dashboard.fallbackEventName"),
            startTime,
            status: info.status ?? "UNKNOWN",
          };
        });
        setUpcomingEvents(list);
      } catch (err) {
        // 인덱스 없을 시 조용히 실패
        logClientError("GroupDashboardPage.loadUpcomingEvents", err, { groupId });
      }
    })();
  }, [groupId]);

  // 이번 주 통계 계산
  const weekStats = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const weekStart = monday.getTime();

    const weekRides = rides.filter((r) => r.startTime >= weekStart);
    const weekActivities = weekRides.flatMap((r) => r.activities);
    const activeMembers = new Set(weekActivities.map((a) => a.userId));

    return {
      totalDistance: weekActivities.reduce((sum, a) => sum + a.summary.distance, 0),
      totalTime: weekActivities.reduce((sum, a) => sum + a.summary.ridingTimeMillis, 0),
      totalElevation: weekActivities.reduce((sum, a) => sum + (a.summary.elevationGain ?? 0), 0),
      rideCount: weekRides.length,
      activeMembers: activeMembers.size,
    };
  }, [rides]);

  // 멤버 순위 정렬 키 (거리/고도/시간/TSS)
  const [rankKey, setRankKey] = useState<"distance" | "elevation" | "time" | "tss">("distance");

  // 멤버별 종합 통계 (이번주)
  const memberWeekStats = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const weekStart = monday.getTime();
    const map = new Map<string, { distance: number; elevation: number; time: number; tss: number }>();
    for (const r of rides) {
      if (r.startTime < weekStart) continue;
      for (const a of r.activities) {
        const e = map.get(a.userId) ?? { distance: 0, elevation: 0, time: 0, tss: 0 };
        e.distance += a.summary.distance;
        e.elevation += a.summary.elevationGain ?? 0;
        e.time += a.summary.ridingTimeMillis;
        e.tss += a.summary.relativeEffort ?? 0;
        map.set(a.userId, e);
      }
    }
    return map;
  }, [rides]);

  if (groupLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-48 rounded-[var(--r-sm)]" style={{ background: "var(--bg-2)" }} />
        <div className="h-4 w-32 rounded-[var(--r-sm)]" style={{ background: "var(--bg-2)" }} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-[var(--r-lg)]" style={{ background: "var(--bg-2)" }} />)}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-[var(--r-lg)]" style={{ background: "var(--bg-2)" }} />)}
        </div>
        <div className="flex gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="w-10 h-10 rounded-full" style={{ background: "var(--bg-2)" }} />)}
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon="👥"
          title={t("empty.groupNotFound")}
          actions={[{ label: t("empty.goToList"), variant: "primary", href: "/groups" }]}
        />
      </div>
    );
  }

  const isCreator = user?.uid === group.creatorId;

  return (
    <div>
      <GroupSubNav group={group} isCreator={isCreator} />

      {/* Hero 영역 */}
      <Card padding="none" className="mb-5" style={{ borderRadius: "var(--r-lg)", padding: "24px 28px" }}>
        <div className="flex items-center" style={{ gap: 'var(--space-5)' }}>
          <div style={{
            width: 72, height: 72, borderRadius: "var(--r-xl)", background: "var(--bg-2)",
            border: "1px solid var(--line)", display: "grid", placeItems: "center",
            fontSize: "var(--fs-2xl)", fontWeight: 800, color: "var(--lime)", letterSpacing: "-0.02em", flexShrink: 0,
          }}>
            {(group.badge ?? group.name ?? "").slice(0, 3).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1-5)" }}>
              {group.kind === "running_crew" ? t("dashboard.kind.runningCrew") : group.kind === "tri_team" ? t("dashboard.kind.triTeam") : group.kind === "corporate" ? t("dashboard.kind.corporate") : t("dashboard.kind.club")}
              {group.city ? ` · ${group.city}` : ""}
            </Text>
            <h1 className="text-[length:var(--fs-2xl)] font-bold" style={{ color: "var(--ink-0)", margin: 0 }}>{group.name}</h1>
            <div className="flex items-center flex-wrap text-[length:var(--fs-sm)] mt-2" style={{ gap: 'var(--space-3)', color: "var(--ink-2)" }}>
              <span>{t("dashboard.memberCount", { count: group.memberCount })}</span>
              {group.createdAt && (
                <>
                  <span style={{ color: "var(--ink-4)" }}>·</span>
                  <span>{t("dashboard.created")} {new Date(typeof group.createdAt === "number" ? group.createdAt : 0).toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}</span>
                </>
              )}
            </div>
          </div>
          {isCreator && (
            <div className="flex items-center" style={{ gap: "var(--space-1-5)" }}>
              <Link to="/event/create" className={`${buttonClass({ variant: 'secondary', size: 'sm' })}`}>{t("dashboard.events")}</Link>
              <Link to={`/group/${groupId}/settings`} className={`${buttonClass({ variant: 'secondary', size: 'sm' })}`}>{t("dashboard.manage")}</Link>
            </div>
          )}
        </div>
        {group.description && (
          <p className="text-[length:var(--fs-sm)] mt-3 line-clamp-2" style={{ color: "var(--ink-2)", margin: "12px 0 0" }}>{group.description}</p>
        )}
      </Card>

      {/* KPI 스트립 — 5개 (시안 정합) */}
      <Card padding="none" className="mb-5" style={{ borderRadius: "var(--r-lg)", padding: 0, display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
        {([
          { l: t("dashboard.stats.weekDistance"), v: `${(weekStats.totalDistance / 1000).toFixed(1)}`, u: "km", sub: weekStats.activeMembers > 0 ? `${t("dashboard.stats.perMember")} ${(weekStats.totalDistance / 1000 / weekStats.activeMembers).toFixed(1)}km` : "" },
          { l: t("dashboard.stats.participatingMembers"), v: `${weekStats.activeMembers}`, u: `/ ${group.memberCount}`, sub: group.memberCount > 0 ? `${t("dashboard.stats.participationRate")} ${Math.round(weekStats.activeMembers / group.memberCount * 100)}%` : "" },
          { l: t("dashboard.stats.rideCount"), v: `${weekStats.rideCount}`, u: t("members.rideUnit"), sub: "" },
          { l: t("dashboard.stats.totalTime"), v: `${Math.floor(weekStats.totalTime / 3600000)}h ${Math.floor((weekStats.totalTime % 3600000) / 60000)}m`, u: null, sub: "" },
          { l: t("dashboard.stats.totalElevation"), v: `${Math.round(weekStats.totalElevation).toLocaleString()}`, u: "m", sub: t("dashboard.stats.sum") },
        ] as { l: string; v: string; u: string | null; sub: string }[]).map((s, i) => (
          <div key={i} style={{ padding: "16px 18px", borderRight: i < 4 ? "1px solid var(--line-soft)" : "none" }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1-5)" }}>{s.l}</Text>
            <div style={{ display: "flex", alignItems: "baseline", gap: 'var(--space-1)', marginBottom: 'var(--space-1)' }}>
              <Text variant="dataLarge" style={{ fontSize: "var(--fs-xl)" }}>{s.v}</Text>
              {s.u && <Text variant="unit">{s.u}</Text>}
            </div>
            {s.sub && <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{s.sub}</div>}
          </div>
        ))}
      </Card>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* 멤버 랭킹 */}
        <div className="flex-1 min-w-0">
          <Card padding="none" style={{ borderRadius: "var(--r-lg)", padding: 0 }}>
            <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <h3 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("dashboard.ranking.title")}</h3>
                <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{rankKey === "distance" ? t("dashboard.ranking.distance") : rankKey === "elevation" ? t("dashboard.ranking.elevation") : rankKey === "time" ? t("dashboard.ranking.time") : t("dashboard.ranking.tss")} {t("dashboard.ranking.by")}</span>
              </div>
              <div role="tablist" aria-label={t("dashboard.ranking.title")} className="flex items-center" style={{ gap: "var(--space-0-5)", background: "var(--bg-2)", padding: "var(--space-1)", borderRadius: "var(--r-md)" }}>
                {([
                  ["distance", t("dashboard.ranking.distance")],
                  ["elevation", t("dashboard.ranking.elevation")],
                  ["time", t("dashboard.ranking.time")],
                  ["tss", t("dashboard.ranking.tss")],
                ] as ["distance" | "elevation" | "time" | "tss", string][]).map(([k, label]) => {
                  const active = rankKey === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setRankKey(k)}
                      style={{
                        padding: "4px 10px", fontSize: "var(--fs-xs)", borderRadius: "var(--r-sm)",
                        background: active ? "var(--bg-3)" : "transparent",
                        color: active ? "var(--ink-0)" : "var(--ink-3)",
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {membersLoading ? (
              <div className="space-y-3 p-4">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded-[var(--r-lg)] animate-pulse" style={{ background: "var(--bg-2)" }} />)}
              </div>
            ) : (
              <div>
                {(() => {
                  const valueOf = (id: string): number => {
                    const s = memberWeekStats.get(id);
                    if (!s) return 0;
                    return rankKey === "distance" ? s.distance
                      : rankKey === "elevation" ? s.elevation
                      : rankKey === "time" ? s.time
                      : s.tss;
                  };
                  const max = members.reduce((m, x) => Math.max(m, valueOf(x.id)), 0);
                  const sorted = [...members].sort((a, b) => valueOf(b.id) - valueOf(a.id));
                  const fmt = (v: number) => rankKey === "distance" ? `${(v / 1000).toFixed(1)}` :
                    rankKey === "elevation" ? `${Math.round(v)}` :
                    rankKey === "time" ? `${Math.floor(v / 3600000)}h ${Math.floor((v % 3600000) / 60000)}m` :
                    `${Math.round(v)}`;
                  const unit = rankKey === "distance" ? "km" : rankKey === "elevation" ? "m" : rankKey === "tss" ? "TSS" : "";
                  return sorted.map((m, i) => {
                    const v = valueOf(m.id);
                    const isMe = m.id === user?.uid;
                    const barPct = max > 0 ? (v / max) * 100 : 0;
                    return (
                      <div key={m.id} style={{
                        padding: "12px 18px", display: "flex", alignItems: "center", gap: 'var(--space-3)',
                        borderTop: i ? "1px solid var(--line-soft)" : "none",
                        background: isMe ? "color-mix(in oklch, var(--lime) 6%, var(--bg-1))" : "transparent",
                      }}>
                        <Text as="div" variant="mono" style={{
                          width: 20, textAlign: "center", fontSize: "var(--fs-xs)",
                          color: i === 0 ? "var(--amber)" : i <= 2 ? "var(--ink-1)" : "var(--ink-4)",
                          fontWeight: i === 0 ? 700 : 500,
                        }}>
                          {i + 1}
                        </Text>
                        <Link to={`/athlete/${m.id}`} title={m.profile?.nickname ?? m.id}>
                          <Avatar name={m.profile?.nickname ?? "?"} imageUrl={m.profile?.photoURL} size="sm" />
                        </Link>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="text-[length:var(--fs-sm)] font-medium truncate" style={{ color: isMe ? "var(--lime)" : "var(--ink-0)" }}>
                            {m.profile?.nickname ?? m.id}{isMe && ` ${t("dashboard.meIndicator")}`}
                          </div>
                        </div>
                        <div style={{ width: 120, height: 6, background: "var(--bg-2)", borderRadius: "var(--r-xs)", overflow: "hidden" }}>
                          <div style={{
                            width: `${barPct}%`, height: "100%",
                            background: isMe ? "var(--lime)" : i < 3 ? "var(--aqua)" : "var(--lime-dim, var(--bg-3))",
                          }} />
                        </div>
                        <div style={{ width: 90, textAlign: "right" }}>
                          <Text variant="dataMedium" style={{ fontSize: "var(--fs-sm)" }}>{fmt(v)}</Text>
                          {unit && <Text variant="unit">{unit}</Text>}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </Card>

          {/* 최근 그룹 라이드 */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("dashboard.recentRides")}</h2>
              <Link to={`/group/${groupId}/rides`} className="text-[length:var(--fs-xs)]" style={{ color: "var(--lime)" }}>{t("dashboard.moreRides")}</Link>
            </div>
            {ridesLoading ? (
              <LoadingSkeleton kind="list" count={3} />
            ) : rides.length === 0 ? (
              <EmptyState icon="🚴" title={t("dashboard.noRides")} compact />
            ) : (
              <div className="space-y-3">
                {rides.slice(0, 5).map((r) => (
                  <RideCard key={r.groupRideId} ride={r} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:w-72 flex-shrink-0 space-y-5 lg:sticky lg:top-6 lg:self-start">
          {/* 멤버 미리보기 */}
          <Card padding="none" className="p-4" style={{ borderRadius: "var(--r-lg)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("dashboard.memberPreview")}</h2>
              <Link to={`/group/${groupId}/members`} className="text-[length:var(--fs-xs)]" style={{ color: "var(--lime)" }}>{t("dashboard.moreRides")}</Link>
            </div>
            {membersLoading ? (
              <div className="flex gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-10 h-10 rounded-full animate-pulse" style={{ background: "var(--bg-2)" }} />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                {members.map((m) => (
                  <Link key={m.id} to={`/athlete/${m.id}`} title={m.profile?.nickname ?? m.id}>
                    <Avatar name={m.profile?.nickname ?? "?"} imageUrl={m.profile?.photoURL} size="md" />
                  </Link>
                ))}
                {group.memberCount > members.length && (
                  <Link
                    to={`/group/${groupId}/members`}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-[length:var(--fs-xs)]"
                    style={{ background: "var(--bg-2)", color: "var(--ink-2)" }}
                  >
                    +{group.memberCount - members.length}
                  </Link>
                )}
              </div>
            )}
          </Card>

          {/* 다가오는 이벤트 */}
          {upcomingEvents.length > 0 && (
            <Card padding="none" className="p-4" style={{ borderRadius: "var(--r-lg)" }}>
              <h2 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("dashboard.upcomingEvents")}</h2>
              <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {upcomingEvents.map((e) => (
                  <li key={e.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line-soft)" }}>
                    <Link to={`/event/${e.id}`} className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="text-[length:var(--fs-sm)] font-semibold truncate" style={{ color: "var(--ink-0)" }}>{e.name}</div>
                        <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>
                          {e.startTime ? new Date(e.startTime).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" }) : "-"}
                        </div>
                      </div>
                      <Chip
                        style={{ color: e.status === "LIVE" ? "var(--lime)" : "var(--aqua)", fontSize: "var(--fs-xs)", whiteSpace: "nowrap" }}
                      >
                        {e.status === "LIVE" ? t("dashboard.eventStatus.live") : t("dashboard.eventStatus.recruiting")}
                      </Chip>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* 그룹 정보 카드 */}
          <Card padding="none" className="p-4" style={{ borderRadius: "var(--r-lg)" }}>
            <h2 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("dashboard.groupInfo")}</h2>
            <dl className="space-y-2 text-[length:var(--fs-sm)]">
              <div className="flex justify-between">
                <dt style={{ color: "var(--ink-2)" }}>{t("memberCount")}</dt>
                <dd className="font-medium" style={{ color: "var(--ink-0)" }}>{t("dashboard.memberCount", { count: group.memberCount })}</dd>
              </div>
              {group.createdAt && (
                <div className="flex justify-between">
                  <dt style={{ color: "var(--ink-2)" }}>{t("dashboard.createdDate")}</dt>
                  <dd className="font-medium" style={{ color: "var(--ink-0)" }}>
                    {(() => {
                      const ts = group.createdAt;
                      const d = typeof ts === "number" ? new Date(ts)
                        : ts && typeof ts === "object" && "seconds" in ts ? new Date((ts as { seconds: number }).seconds * 1000)
                        : null;
                      return d ? d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : "";
                    })()}
                  </dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
