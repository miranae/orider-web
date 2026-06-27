import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { EmptyState, ErrorState, LoadingSkeleton, PermissionGate } from "../../components/redesign";
import { normalizeStartTime } from "../../utils/event-time";
import { Button, Card, Chip, Text } from "../../theme/components";

type ParticipantStatus = "REGISTERED" | "PAID" | "CHECKED_IN" | "RACING" | "FINISHED" | "DNF" | "DSQ" | "REFUNDED" | "NO_SHOW" | "CANCELLED";

interface CategoryDef {
  id: string;
  name: string;
  color: "lime" | "aqua" | "amber";
}

interface Checkpoint {
  cpId?: string;
  name: string;
  km?: number;
  distanceFromStart?: number;
}

interface EventHead {
  id: string;
  name: string;
  status: string;
  creatorId: string;
  hostIds: string[];
  startTime: number;
  feeType: "FREE" | "PAID";
  categories: CategoryDef[];
  checkpoints: Checkpoint[];
}

interface ParticipantRow {
  userId: string;
  bib: number | null;
  realName: string;
  nickname: string;
  category: string | null;
  age: number | null;
  gender: "M" | "F" | "X" | null;
  phone: string;
  status: ParticipantStatus;
  cpProgress: number;
  bestTime: string;
  team: string;
  paid: boolean;
  dnfReason?: string | null;
  registrationNumber?: string;
}

const CATEGORY_COLORS: Array<"lime" | "aqua" | "amber"> = ["lime", "aqua", "amber"];

function StatusChip({ status }: { status: ParticipantStatus }) {
  const { t } = useTranslation("event");
  const STATUS_META: Record<ParticipantStatus, { labelKey: string; color: string; bg: string }> = {
    REGISTERED: { labelKey: "label.registrationStatus", color: "var(--ink-3)", bg: "var(--bg-2)" },
    PAID: { labelKey: "label.paymentComplete", color: "var(--aqua)", bg: "color-mix(in oklch, var(--aqua) 8%, var(--bg-2))" },
    CHECKED_IN: { labelKey: "label.checkedIn", color: "var(--lime)", bg: "color-mix(in oklch, var(--lime) 10%, var(--bg-2))" },
    RACING: { labelKey: "label.racing", color: "var(--lime)", bg: "color-mix(in oklch, var(--lime) 15%, var(--bg-2))" },
    FINISHED: { labelKey: "stats.finished", color: "var(--ink-1)", bg: "var(--bg-3)" },
    DNF: { labelKey: "label.dnf", color: "var(--amber)", bg: "color-mix(in oklch, var(--amber) 10%, var(--bg-2))" },
    DSQ: { labelKey: "label.disqualified", color: "var(--rose)", bg: "color-mix(in oklch, var(--rose) 10%, var(--bg-2))" },
    REFUNDED: { labelKey: "label.refunded", color: "var(--ink-3)", bg: "var(--bg-2)" },
    NO_SHOW: { labelKey: "label.noShow", color: "var(--rose)", bg: "color-mix(in oklch, var(--rose) 8%, var(--bg-2))" },
    CANCELLED: { labelKey: "cancelled", color: "var(--ink-3)", bg: "var(--bg-2)" },
  };
  const m = STATUS_META[status] ?? STATUS_META.REGISTERED;
  return (
    <Chip
      style={{
        background: m.bg,
        color: m.color,
        borderColor: `color-mix(in oklch, ${m.color} 30%, transparent)`,
        fontSize: 10,
        padding: "2px 8px",
      }}
    >
      {t(m.labelKey)}
    </Chip>
  );
}

function CpProgress({ progress, total }: { progress: number; total: number }) {
  return (
    <div className="flex items-center" style={{ gap: 3 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            width: 16,
            height: 4,
            borderRadius: 1,
            background: i < progress ? "var(--lime)" : "var(--bg-3)",
          }}
        />
      ))}
      <span style={{ fontSize: 10, color: "var(--ink-3)", fontFamily: "var(--font-mono)", marginLeft: 'var(--space-1)' }}>
        {progress}/{total}
      </span>
    </div>
  );
}

function StatCard({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <Card padding="none" style={{ padding: "14px 16px" }}>
      <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{label}</Text>
      <Text as="div" variant="dataMedium" style={{ color: tone || "var(--ink-0)" }}>{value}</Text>
      {sub && <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 'var(--space-1)', fontFamily: "var(--font-mono)" }}>{sub}</div>}
    </Card>
  );
}

function ageFromBirth(birth: string): number | null {
  if (!birth) return null;
  const d = new Date(birth);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export default function EventParticipantsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation("event");

  const [event, setEvent] = useState<EventHead | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"bib" | "name" | "time" | "status">("bib");
  const [drawer, setDrawer] = useState<ParticipantRow | null>(null);
  const [toast, setToast] = useState<{ type: "ok" | "warn" | "err"; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const showToast = useCallback((type: "ok" | "warn" | "err", msg: string) => {
    setToast({ type, msg });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const evtSnap = await getDoc(doc(firestore, "events", eventId));
      if (!evtSnap.exists()) {
        setEvent(null);
        return;
      }
      const d = evtSnap.data();
      const info = d.info || {};
      const rawCats: Array<{ id: string; name?: string; label?: string }> = Array.isArray(info.categories)
        ? info.categories
        : [];
      const categories: CategoryDef[] = rawCats.map((c, i) => ({
        id: c.id,
        name: c.name ?? c.label ?? c.id,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] ?? "lime",
      }));
      const rawCps: Array<{ cpId?: string; name?: string; distanceFromStart?: number }> = Array.isArray(info.checkpoints)
        ? info.checkpoints
        : [];
      const checkpoints: Checkpoint[] = rawCps.map((c, i) => ({
        cpId: c.cpId ?? `cp${i}`,
        name: c.name ?? `CP${i + 1}`,
        distanceFromStart: c.distanceFromStart,
      }));
      const feeType: "FREE" | "PAID" =
        info.feeType === "PAID" || (typeof info.entryFee === "number" && info.entryFee > 0) ? "PAID" : "FREE";
      setEvent({
        id: evtSnap.id,
        name: info.name || t("noName"),
        status: info.status || "UNKNOWN",
        creatorId: info.creatorId || "",
        hostIds: Array.isArray(info.hostIds) ? info.hostIds : [],
        startTime: normalizeStartTime(info.startTime),
        feeType,
        categories,
        checkpoints,
      });

      const partsSnap = await getDocs(collection(firestore, `events/${eventId}/participants`));

      // 닉네임 비정규화 — users/{uid}.nickname
      const userIds = partsSnap.docs.map((d) => d.id);
      const userMap = new Map<string, { nickname: string; team: string }>();
      await Promise.all(
        userIds.map(async (uid) => {
          try {
            const us = await getDoc(doc(firestore, "users", uid));
            const ud = us.exists() ? us.data() : {};
            userMap.set(uid, {
              nickname: ud.nickname || ud.displayName || t("participantsView.defaultRider"),
              team: ud.team || "—",
            });
          } catch {
            userMap.set(uid, { nickname: t("participantsView.defaultRider"), team: "—" });
          }
        })
      );

      const rows: ParticipantRow[] = partsSnap.docs.map((p) => {
        const data = p.data();
        const u = userMap.get(p.id);
        const status = (data.status as ParticipantStatus) || "REGISTERED";
        return {
          userId: p.id,
          bib: typeof data.bib === "number" ? data.bib : null,
          realName: data.realName || u?.nickname || t("participantsView.defaultRider"),
          nickname: u?.nickname || t("participantsView.defaultRider"),
          category: data.category ?? null,
          age: data.birth ? ageFromBirth(data.birth) : null,
          gender: data.gender ?? null,
          phone: data.phone || "",
          status,
          cpProgress: typeof data.cpProgress === "number" ? data.cpProgress : 0,
          bestTime: data.bestTime || "—",
          team: u?.team || "—",
          // 무료 이벤트: REFUNDED 외 모두 paid 취급. 유료 이벤트: REGISTERED는 미결제, 그 외 paid.
          // 명시적인 data.paid 필드가 있으면 우선.
          paid:
            typeof data.paid === "boolean"
              ? data.paid
              : feeType === "FREE"
                ? status !== "REFUNDED"
                : status !== "REGISTERED" && status !== "REFUNDED",
          dnfReason: data.dnfReason ?? null,
          registrationNumber: data.registrationNumber,
        };
      });
      setParticipants(rows);
    } catch (err) {
      console.error("참가자 조회 실패:", err);
      setLoadError(err instanceof Error ? err.message : t("participantsView.loadError"));
    } finally {
      setLoading(false);
    }
  }, [eventId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const isHost = !!event && !!user && (user.uid === event.creatorId || event.hostIds.includes(user.uid));

  const filtered = useMemo(() => {
    let r = participants;
    const q = search.trim().toLowerCase();
    if (q) {
      r = r.filter(
        (p) =>
          p.realName.toLowerCase().includes(q) ||
          p.nickname.toLowerCase().includes(q) ||
          String(p.bib ?? "").includes(q) ||
          p.phone.includes(q)
      );
    }
    if (categoryFilter !== "ALL") r = r.filter((p) => p.category === categoryFilter);
    if (statusFilter !== "ALL") r = r.filter((p) => p.status === statusFilter);

    return [...r].sort((a, b) => {
      if (sortBy === "bib") return (a.bib ?? 9999) - (b.bib ?? 9999);
      if (sortBy === "name") return a.realName.localeCompare(b.realName);
      if (sortBy === "time") {
        const at = a.bestTime === "—" ? "99:99:99" : a.bestTime;
        const bt = b.bestTime === "—" ? "99:99:99" : b.bestTime;
        return at.localeCompare(bt);
      }
      return a.status.localeCompare(b.status);
    });
  }, [participants, search, categoryFilter, statusFilter, sortBy]);

  const stats = useMemo(() => {
    const total = participants.length;
    const paid = participants.filter((p) => p.paid).length;
    const racing = participants.filter((p) => p.status === "RACING").length;
    const finished = participants.filter((p) => p.status === "FINISHED").length;
    const dnf = participants.filter((p) => p.status === "DNF" || p.status === "DSQ").length;
    const noBib = participants.filter((p) => p.paid && !p.bib && p.status !== "REFUNDED").length;
    const finishRate = finished + dnf > 0 ? Math.round((finished / (finished + dnf)) * 100) : 0;
    return { total, paid, racing, finished, dnf, noBib, finishRate };
  }, [participants]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.userId)));
  }

  async function handleAssignBibs(mode: "sequential" | "category" | "random") {
    if (!eventId || busy) return;
    if (stats.noBib === 0) {
      showToast("warn", t("message.noBibAssigned"));
      return;
    }
    setBusy(true);
    try {
      const fn = httpsCallable<unknown, { assigned: number }>(functions, "assignBibs");
      const res = await fn({ eventId, mode });
      showToast("ok", t("participantsView.bibAssigned", { count: res.data.assigned }));
      await load();
    } catch (err) {
      console.error("배번 부여 실패:", err);
      showToast("err", err instanceof Error ? err.message : t("participantsView.bibAssignError"));
    } finally {
      setBusy(false);
    }
  }

  async function applyBulkAction(
    action: "checkin" | "dnf" | "refund" | "sms" | "dsq",
    ids: string[]
  ) {
    if (!eventId || busy) return;
    if (ids.length === 0) {
      showToast("warn", t("participantsView.selectFirst"));
      return;
    }
    setBusy(true);
    try {
      const fn = httpsCallable<unknown, { updated: number }>(functions, "bulkUpdateParticipants");
      const res = await fn({ eventId, userIds: ids, action });
      const labelKeys: Record<string, string> = {
        checkin: "participantsView.action.checkin",
        dnf: "participantsView.action.dnf",
        dsq: "participantsView.action.dsq",
        refund: "participantsView.action.refund",
        sms: "participantsView.action.sms",
      };
      showToast(
        action === "refund" ? "warn" : "ok",
        t("participantsView.bulkDone", { count: res.data.updated ?? ids.length, action: t(labelKeys[action] ?? "participantsView.action.process") })
      );
      setSelected(new Set());
      if (action !== "sms") await load();
    } catch (err) {
      console.error("일괄 처리 실패:", err);
      showToast("err", err instanceof Error ? err.message : t("participantsView.bulkError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleBulk(action: "checkin" | "dnf" | "refund" | "sms" | "dsq") {
    await applyBulkAction(action, Array.from(selected));
  }

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <PermissionGate title={t("participantsView.loginRequired")} />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-6">
        <LoadingSkeleton kind="list" count={8} />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <ErrorState title={t("participantsView.loadFailed")} description={loadError} onRetry={load} />
      </div>
    );
  }
  if (!event) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon="🗓️"
          title={t("participantsView.eventNotFound")}
          actions={[{ label: t("participantsView.eventListLink"), variant: "primary", onClick: () => navigate("/events") }]}
        />
      </div>
    );
  }
  if (!isHost) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon="🔒"
          title={t("participantsView.noPermission")}
          description={t("participantsView.noPermissionDesc")}
          actions={[{ label: t("participantsView.eventDetailLink"), variant: "primary", onClick: () => navigate(`/event/${eventId}`) }]}
        />
      </div>
    );
  }

  const isLive = event.status === "LIVE";
  const fmtStart = event.startTime
    ? new Date(event.startTime).toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div>
      {/* 헤더 */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "var(--space-5) var(--space-6) var(--space-4)" }}>
        <div className="flex items-center" style={{ gap: 'var(--space-2)', fontSize: 11, color: "var(--ink-3)", marginBottom: 'var(--space-3)' }}>
          <Link to="/events" style={{ color: "var(--ink-3)" }}>{t("title")}</Link>
          <span style={{ color: "var(--ink-4)" }}>›</span>
          <Link to={`/event/${eventId}`} style={{ color: "var(--ink-3)" }} className="truncate">
            {event.name}
          </Link>
          <span style={{ color: "var(--ink-4)" }}>›</span>
          <span style={{ color: "var(--ink-2)" }}>{t("participantsTitle")}</span>
        </div>

        <div className="flex items-end justify-between flex-wrap" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
          <div>
            <div className="flex items-center" style={{ gap: 10, marginBottom: 6 }}>
              {isLive ? (
                <Chip
                  style={{
                    color: "var(--lime)",
                    borderColor: "color-mix(in oklch, var(--lime) 40%, transparent)",
                    fontSize: 10,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--lime)",
                      boxShadow: "0 0 0 3px color-mix(in oklch, var(--lime) 30%, transparent)",
                      display: "inline-block",
                      marginRight: 6,
                    }}
                  />
                  LIVE
                </Chip>
              ) : (
                <Chip style={{ fontSize: 10 }}>{event.status}</Chip>
              )}
              {fmtStart && <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{t("participantsView.startSuffix", { time: fmtStart })}</span>}
            </div>
            <h1 style={{ fontSize: 24, letterSpacing: "-0.02em", color: "var(--ink-0)", margin: 0 }}>
              {t("participantsTitle")}
            </h1>
          </div>
          <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
            <Button type="button" onClick={() => navigate(`/event/${eventId}/edit`)} variant="secondary" size="sm">
              ✎ {t("action.editEvent")}
            </Button>
            <Button
              type="button"
              onClick={() => alert(t("participantsView.csvSoon"))} variant="secondary" size="sm"
            >
              ⬇ {t("action.exportCSV")}
            </Button>
            <Button
              type="button"
              onClick={() => alert(t("participantsView.noticeSoon"))} variant="primary" size="sm"
            >
              📢 {t("participantsView.broadcastBtn")}
            </Button>
          </div>
        </div>

        {/* 통계 카드 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 'var(--space-5)' }}>
          <StatCard label={t("stats.total")} value={stats.total} sub={t("participantsView.paidSub", { count: stats.paid })} />
          <StatCard label={t("stats.racing")} value={stats.racing} tone="var(--lime)" />
          <StatCard label={t("stats.finished")} value={stats.finished} />
          <StatCard label={t("stats.dnf")} value={stats.dnf} tone="var(--amber)" />
          <StatCard label={t("stats.noBib")} value={stats.noBib} tone={stats.noBib > 0 ? "var(--amber)" : undefined} />
          <StatCard label={t("label.finishRate")} value={`${stats.finishRate}%`} sub={t("participantsView.finishRateSub", { count: stats.finished + stats.dnf })} />
        </div>

        {/* 배번 부여 알림 */}
        {stats.noBib > 0 && (
          <div
            className="flex items-center flex-wrap"
            style={{
              padding: "var(--space-3) var(--space-4)",
              background: "color-mix(in oklch, var(--amber) 6%, var(--bg-2))",
              border: "1px solid color-mix(in oklch, var(--amber) 30%, var(--line-soft))",
              borderRadius: 5,
              marginBottom: 'var(--space-4)',
              gap: 'var(--space-3)',
            }}
          >
            <span aria-hidden="true" style={{ color: "var(--amber)", flexShrink: 0 }}>⚠</span>
            <div style={{ flex: 1, fontSize: 12, color: "var(--ink-1)" }}>
              {t("participantsView.noBibWarning", { count: stats.noBib })}
            </div>
            <Button
              type="button"
              onClick={() => handleAssignBibs("sequential")}
              disabled={busy} variant="secondary" size="sm" className="disabled:opacity-50"
            >
              {t("participantsView.bib.sequential")}
            </Button>
            <Button
              type="button"
              onClick={() => handleAssignBibs("category")}
              disabled={busy} variant="secondary" size="sm" className="disabled:opacity-50"
            >
              {t("participantsView.bib.byCategory")}
            </Button>
            <Button
              type="button"
              onClick={() => handleAssignBibs("random")}
              disabled={busy} variant="secondary" size="sm" className="disabled:opacity-50"
            >
              {t("participantsView.bib.random")}
            </Button>
          </div>
        )}
      </div>

      {/* 리스트 */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px 40px" }}>
        <Card padding="none" style={{ padding: 0, overflow: "hidden" }}>
          {/* 필터 바 */}
          <div
            className="flex items-center flex-wrap"
            style={{ padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--line-soft)", gap: 10 }}
          >
            <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 340 }}>
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--ink-3)",
                  fontSize: 12,
                }}
              >
                🔍
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("participantsView.searchPlaceholder")}
                style={{
                  width: "100%",
                  padding: "var(--space-2) var(--space-3) var(--space-2) var(--space-7)",
                  fontSize: 12,
                  background: "var(--bg-2)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 5,
                  color: "var(--ink-0)",
                }}
              />
            </div>

            <div className="flex" style={{ gap: 'var(--space-1)' }}>
              <Button
                type="button"
                onClick={() => setCategoryFilter("ALL")}
                aria-pressed={categoryFilter === "ALL"} variant="secondary" size="sm"
                style={{ background: categoryFilter === "ALL" ? "var(--bg-3)" : "var(--bg-2)", fontSize: 11 }}
              >
                {t("filter.all")}
              </Button>
              {event.categories.map((c) => {
                const active = categoryFilter === c.id;
                return (
                  <Button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryFilter(c.id)}
                    aria-pressed={active} variant="secondary" size="sm"
                    style={{ background: active ? "var(--bg-3)" : "var(--bg-2)", fontSize: 11 }}
                  >
                    {c.name}
                  </Button>
                );
              })}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: "7px 10px",
                fontSize: 11,
                background: "var(--bg-2)",
                border: "1px solid var(--line-soft)",
                borderRadius: 5,
                color: "var(--ink-1)",
              }}
            >
              <option value="ALL">{t("participantsView.allStatuses")}</option>
              <option value="PAID">{t("label.paymentComplete")}</option>
              <option value="CHECKED_IN">{t("label.checkedIn")}</option>
              <option value="RACING">{t("label.racing")}</option>
              <option value="FINISHED">{t("stats.finished")}</option>
              <option value="DNF">{t("label.dnf")}</option>
              <option value="DSQ">{t("label.disqualified")}</option>
              <option value="REFUNDED">{t("label.refunded")}</option>
            </select>

            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {t("participantsView.countDisplay", { count: filtered.length })}
              {selected.size > 0 && ` · ${t("participantsView.selectedCount", { count: selected.size })}`}
            </div>
          </div>

          {/* 벌크 액션 바 */}
          {selected.size > 0 && (
            <div
              className="flex items-center flex-wrap"
              style={{
                padding: "10px 16px",
                background: "color-mix(in oklch, var(--lime) 5%, var(--bg-2))",
                borderBottom: "1px solid var(--line-soft)",
                gap: 'var(--space-2)',
              }}
            >
              <span style={{ fontSize: 12, color: "var(--ink-1)" }}>{t("participantsView.bulkPrefix", { count: selected.size })}</span>
              <div style={{ flex: 1 }} />
              <Button
                type="button"
                onClick={() => handleBulk("checkin")}
                disabled={busy} variant="secondary" size="sm" className="disabled:opacity-50"
              >
                {t("participantsView.action.checkin")}
              </Button>
              <Button
                type="button"
                onClick={() => handleBulk("sms")}
                disabled={busy} variant="secondary" size="sm" className="disabled:opacity-50"
              >
                📤 {t("participantsView.action.sms")}
              </Button>
              <Button
                type="button"
                onClick={() => handleBulk("dnf")}
                disabled={busy} variant="secondary" size="sm" className="disabled:opacity-50"
                style={{ color: "var(--amber)", borderColor: "color-mix(in oklch, var(--amber) 30%, var(--line-soft))" }}
              >
                {t("participantsView.action.dnf")}
              </Button>
              <Button
                type="button"
                onClick={() => handleBulk("refund")}
                disabled={busy} variant="secondary" size="sm" className="disabled:opacity-50"
                style={{ color: "var(--rose)", borderColor: "color-mix(in oklch, var(--rose) 30%, var(--line-soft))" }}
              >
                {t("participantsView.action.refund")}
              </Button>
              <Button type="button" onClick={() => setSelected(new Set())} variant="secondary" size="sm">
                {t("participantsView.deselectAll")}
              </Button>
            </div>
          )}

          {/* 테이블 */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr
                  style={{
                    background: "var(--bg-2)",
                    color: "var(--ink-3)",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  <th style={{ width: 36, padding: "10px 16px", textAlign: "left" }}>
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      aria-label={t("participantsView.selectAll")}
                    />
                  </th>
                  <th
                    onClick={() => setSortBy("bib")}
                    style={{ width: 80, padding: "10px 8px", textAlign: "left", cursor: "pointer" }}
                  >
                    {t("bibNumber")} {sortBy === "bib" && "↓"}
                  </th>
                  <th
                    onClick={() => setSortBy("name")}
                    style={{ padding: "10px 8px", textAlign: "left", cursor: "pointer" }}
                  >
                    {t("participantsView.colParticipant")} {sortBy === "name" && "↓"}
                  </th>
                  <th style={{ width: 90, padding: "10px 8px", textAlign: "left" }}>{t("label.categories")}</th>
                  <th style={{ width: 70, padding: "10px 8px", textAlign: "left" }}>{t("participantsView.colAgeGender")}</th>
                  <th
                    onClick={() => setSortBy("status")}
                    style={{ width: 90, padding: "10px 8px", textAlign: "left", cursor: "pointer" }}
                  >
                    {t("participantsView.colStatus")} {sortBy === "status" && "↓"}
                  </th>
                  <th style={{ width: 140, padding: "10px 8px", textAlign: "left" }}>{t("checkpoints")}</th>
                  <th
                    onClick={() => setSortBy("time")}
                    style={{ width: 90, padding: "10px 8px", textAlign: "right", cursor: "pointer" }}
                  >
                    {t("bestTime")} {sortBy === "time" && "↓"}
                  </th>
                  <th style={{ width: 120, padding: "10px 8px", textAlign: "left" }}>{t("team")}</th>
                  <th style={{ width: 44, padding: "10px 16px", textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: "60px 20px", textAlign: "center", color: "var(--ink-3)" }}>
                      {t("participantsView.noMatch")}
                    </td>
                  </tr>
                ) : (
                  filtered.map((p, i) => {
                    const cat = event.categories.find((c) => c.id === p.category);
                    const isSelected = selected.has(p.userId);
                    return (
                      <tr
                        key={p.userId}
                        style={{
                          borderTop: "1px solid var(--line-soft)",
                          background: isSelected
                            ? "color-mix(in oklch, var(--lime) 4%, transparent)"
                            : i % 2 === 1
                            ? "color-mix(in oklch, var(--bg-2) 40%, transparent)"
                            : "transparent",
                        }}
                      >
                        <td style={{ padding: "var(--space-3) var(--space-4)" }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(p.userId)}
                            aria-label={t("participantsView.selectRow", { name: p.realName })}
                          />
                        </td>
                        <td
                          style={{
                            padding: "var(--space-3) var(--space-2)",
                            fontFamily: "var(--font-mono)",
                            color: p.bib ? "var(--ink-0)" : "var(--ink-3)",
                          }}
                        >
                          {p.bib ? (
                            <span style={{ fontWeight: 600 }}>#{String(p.bib).padStart(3, "0")}</span>
                          ) : (
                            <span style={{ fontSize: 10 }}>{t("participantsView.bibNone")}</span>
                          )}
                        </td>
                        <td style={{ padding: "var(--space-3) var(--space-2)" }}>
                          <button
                            type="button"
                            onClick={() => setDrawer(p)}
                            style={{
                              textAlign: "left",
                              color: "var(--ink-0)",
                              fontWeight: 500,
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            {p.realName}
                          </button>
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--ink-3)",
                              fontFamily: "var(--font-mono)",
                              marginTop: 1,
                            }}
                          >
                            {p.phone || "—"}
                          </div>
                        </td>
                        <td style={{ padding: "var(--space-3) var(--space-2)" }}>
                          {cat ? (
                            <Chip
                              style={{
                                fontSize: 10,
                                color: `var(--${cat.color})`,
                                borderColor: `color-mix(in oklch, var(--${cat.color}) 30%, transparent)`,
                                padding: "2px 7px",
                              }}
                            >
                              {cat.name}
                            </Chip>
                          ) : (
                            <span style={{ fontSize: 10, color: "var(--ink-3)" }}>—</span>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "var(--space-3) var(--space-2)",
                            fontSize: 11,
                            color: "var(--ink-2)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {p.age ?? "—"} · {p.gender ?? "—"}
                        </td>
                        <td style={{ padding: "var(--space-3) var(--space-2)" }}>
                          <StatusChip status={p.status} />
                        </td>
                        <td style={{ padding: "var(--space-3) var(--space-2)" }}>
                          <CpProgress progress={p.cpProgress} total={Math.max(1, event.checkpoints.length)} />
                        </td>
                        <td
                          style={{
                            padding: "var(--space-3) var(--space-2)",
                            fontFamily: "var(--font-mono)",
                            color: "var(--ink-1)",
                            textAlign: "right",
                            fontSize: 11,
                          }}
                        >
                          {p.bestTime}
                        </td>
                        <td style={{ padding: "var(--space-3) var(--space-2)", fontSize: 11, color: "var(--ink-3)" }}>{p.team}</td>
                        <td style={{ padding: "var(--space-3) var(--space-4)", textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => setDrawer(p)}
                            aria-label={t("participantsView.viewDetail", { name: p.realName })}
                            style={{
                              color: "var(--ink-3)",
                              background: "none",
                              border: "none",
                              padding: 'var(--space-1)',
                              cursor: "pointer",
                            }}
                          >
                            ⋯
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 드로어 */}
      {drawer && (
        <>
          <div
            onClick={() => setDrawer(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 80 }}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: 400,
              maxWidth: "100vw",
              background: "var(--bg-1)",
              borderLeft: "1px solid var(--line-soft)",
              zIndex: 90,
              overflowY: "auto",
            }}
          >
            <div
              className="flex items-center justify-between"
              style={{ padding: "18px 20px", borderBottom: "1px solid var(--line-soft)" }}
            >
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)", marginBottom: 2 }}>
                  {drawer.bib ? `#${String(drawer.bib).padStart(3, "0")}` : t("participantsView.bibNone")}
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "var(--ink-0)" }}>{drawer.realName}</div>
              </div>
              <Button
                type="button"
                onClick={() => setDrawer(null)}
                aria-label={t("participantsView.close")} variant="secondary" size="sm"
                style={{ padding: 'var(--space-2)' }}
              >
                ×
              </Button>
            </div>

            <div style={{ padding: 'var(--space-5)' }}>
              <StatusChip status={drawer.status} />
              {drawer.dnfReason && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "8px 10px",
                    background: "color-mix(in oklch, var(--amber) 8%, var(--bg-2))",
                    borderRadius: 4,
                    fontSize: 11,
                    color: "var(--ink-1)",
                  }}
                >
                  {t("participantsView.dnfReason", { reason: drawer.dnfReason })}
                </div>
              )}

              <div className="flex flex-col" style={{ marginTop: 'var(--space-5)', gap: 10 }}>
                {[
                  [t("label.categories"), event.categories.find((c) => c.id === drawer.category)?.name ?? "—"],
                  [t("nickname"), drawer.nickname],
                  [t("age"), drawer.age != null ? t("participantsView.ageGenderValue", { age: drawer.age, gender: drawer.gender === "M" ? t("participantsView.male") : drawer.gender === "F" ? t("participantsView.female") : "—" }) : "—"],
                  [t("phone"), drawer.phone || "—"],
                  [t("team"), drawer.team],
                  [t("participantsView.drawerPaid"), drawer.paid ? t("participantsView.paidYes") : t("participantsView.paidNo")],
                  [t("bestTime"), drawer.bestTime],
                  [t("label.registration"), drawer.registrationNumber || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between" style={{ fontSize: 12 }}>
                    <span style={{ color: "var(--ink-3)" }}>{k}</span>
                    <span style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>{v}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-5)', borderTop: "1px solid var(--line-soft)" }}>
                <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-3)' }}>{t("participantsView.cpPassage")}</Text>
                <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
                  {event.checkpoints.length === 0 ? (
                    <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("participantsView.noCheckpoints")}</div>
                  ) : (
                    event.checkpoints.map((cp, i) => {
                      const passed = i < drawer.cpProgress;
                      return (
                        <div key={cp.cpId ?? i} className="flex items-center" style={{ gap: 10 }}>
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              background: passed ? "var(--lime)" : "var(--bg-3)",
                              color: passed ? "var(--primary-fg)" : "var(--ink-3)",
                              display: "grid",
                              placeItems: "center",
                              fontSize: 10,
                              fontFamily: "var(--font-mono)",
                              fontWeight: 600,
                            }}
                            aria-hidden="true"
                          >
                            {passed ? "✓" : i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div
                              style={{
                                fontSize: 12,
                                color: passed ? "var(--ink-0)" : "var(--ink-3)",
                              }}
                            >
                              {cp.name}
                            </div>
                            {cp.distanceFromStart != null && (
                              <div
                                style={{ fontSize: 10, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}
                              >
                                {(cp.distanceFromStart / 1000).toFixed(1)} km
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div
                className="flex flex-col"
                style={{
                  marginTop: 'var(--space-6)',
                  paddingTop: 'var(--space-5)',
                  borderTop: "1px solid var(--line-soft)",
                  gap: 6,
                }}
              >
                <Button
                  type="button" variant="secondary" size="sm"
                  style={{ justifyContent: "flex-start", width: "100%" }}
                  onClick={() => alert(t("participantsView.bibChangeSoon"))}
                >
                  ✎ {t("participantsView.action.bibChange")}
                </Button>
                <Button
                  type="button" variant="secondary" size="sm"
                  style={{ justifyContent: "flex-start", width: "100%" }}
                  onClick={() => alert(t("participantsView.smsSingleSoon"))}
                >
                  📤 {t("participantsView.action.smsSingle")}
                </Button>
                <Button
                  type="button" variant="secondary" size="sm"
                  style={{ justifyContent: "flex-start", width: "100%" }}
                  onClick={() => navigate(`/event/${eventId}/dashboard`)}
                >
                  📍 {t("participantsView.action.liveView")}
                </Button>
                {drawer.status === "RACING" && (
                  <Button
                    type="button" variant="secondary" size="sm" className="disabled:opacity-50"
                    style={{
                      justifyContent: "flex-start",
                      width: "100%",
                      color: "var(--amber)",
                      borderColor: "color-mix(in oklch, var(--amber) 30%, var(--line-soft))",
                    }}
                    disabled={busy}
                    onClick={async () => {
                      const id = drawer.userId;
                      setDrawer(null);
                      await applyBulkAction("dnf", [id]);
                    }}
                  >
                    {t("participantsView.action.manualDnf")}
                  </Button>
                )}
                <Button
                  type="button" variant="secondary" size="sm" className="disabled:opacity-50"
                  style={{
                    justifyContent: "flex-start",
                    width: "100%",
                    color: "var(--rose)",
                    borderColor: "color-mix(in oklch, var(--rose) 30%, var(--line-soft))",
                  }}
                  disabled={busy}
                  onClick={async () => {
                    if (!confirm(t("participantsView.confirmRefund"))) return;
                    const id = drawer.userId;
                    setDrawer(null);
                    await applyBulkAction("refund", [id]);
                  }}
                >
                  {t("participantsView.action.cancelRefund")}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            top: 72,
            right: 24,
            maxWidth: 400,
            padding: "var(--space-3) var(--space-4)",
            background:
              toast.type === "ok"
                ? "color-mix(in oklch, var(--lime) 12%, var(--bg-2))"
                : toast.type === "warn"
                ? "color-mix(in oklch, var(--amber) 12%, var(--bg-2))"
                : "color-mix(in oklch, var(--rose) 12%, var(--bg-2))",
            border: `1px solid ${toast.type === "ok" ? "var(--lime)" : toast.type === "warn" ? "var(--amber)" : "var(--rose)"}`,
            borderRadius: 5,
            fontSize: 12,
            color: "var(--ink-0)",
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            boxShadow: "var(--shadow-lg)",
            zIndex: 200,
          }}
        >
          <span aria-hidden="true">{toast.type === "ok" ? "✓" : "⚠"}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
