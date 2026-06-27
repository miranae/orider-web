import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { EmptyState, ErrorState, LoadingSkeleton, PermissionGate, DateField, TimeField } from "../../components/redesign";
import { normalizeStartTime } from "../../utils/event-time";
import { Button, Card, Chip, Text } from "../../theme/components";

type EventType = "GRANFONDO" | "TOUR" | "TT" | "TRAINING";
type Visibility = "PUBLIC" | "GROUP" | "PRIVATE";
type FeeType = "FREE" | "PAID";
type Status = "DRAFT" | "OPEN" | "LIVE" | "FINISHED" | "CANCELLED" | "UNKNOWN";

interface CategoryRow {
  id: string;
  label: string;
  slots: number;
  filled: number;
  req: string;
}

interface CourseInfo {
  id: string;
  name: string;
  region?: string;
  distance?: number;       // m
  elevationGain?: number;  // m
  cat?: string;
}

interface FormData {
  name: string;
  type: EventType;
  visibility: Visibility;
  description: string;
  hostName: string;
  hostPhone: string;
  date: string;
  startTime: string;
  meetLocation: string;
  meetTime: string;
  expectedDuration: string;
  feeType: FeeType;
  fee: number;
  categories: CategoryRow[];
  openAt: string;
  closeAt: string;
  cutoffEnabled: boolean;
  cutoffBuffer: number;
  sosEnabled: boolean;
  liveTracking: boolean;
  mechanicalSag: boolean;
}

const SECTION_DEFS: Array<{ id: string; labelKey: string }> = [
  { id: "basic", labelKey: "edit.section.basic" },
  { id: "course", labelKey: "edit.section.course" },
  { id: "register", labelKey: "edit.section.register" },
  { id: "safety", labelKey: "edit.section.safety" },
  { id: "danger", labelKey: "edit.section.danger" },
] as const;

const TYPE_DEFS: Array<{ value: EventType; labelKey: string }> = [
  { value: "GRANFONDO", labelKey: "type.granfondo" },
  { value: "TOUR", labelKey: "type.tour" },
  { value: "TT", labelKey: "type.timetrail" },
  { value: "TRAINING", labelKey: "type.training" },
];

const VISIBILITY_DEFS: Array<{ value: Visibility; labelKey: string }> = [
  { value: "PUBLIC", labelKey: "visibility.public" },
  { value: "GROUP", labelKey: "visibility.group" },
  { value: "PRIVATE", labelKey: "visibility.private" },
];

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  fontSize: 13,
  background: "var(--bg-2)",
  border: "1px solid var(--line-soft)",
  borderRadius: 5,
  color: "var(--ink-0)",
  fontFamily: "inherit",
};

function Field({
  label,
  required,
  sub,
  hint,
  warn,
  children,
}: {
  label: string;
  required?: boolean;
  sub?: string;
  hint?: string;
  warn?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation("event");
  return (
    <div style={{ marginBottom: 18 }}>
      <label className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-1)" }}>{label}</span>
        {required && <span style={{ color: "var(--rose)", fontSize: 11 }}>*</span>}
        {warn && (
          <Chip
            style={{
              fontSize: 9,
              color: "var(--amber)",
              borderColor: "color-mix(in oklch, var(--amber) 40%, transparent)",
            }}
          >
            {t("warn.participantNotice")}
          </Chip>
        )}
        {sub && <span style={{ fontSize: 10, color: "var(--ink-3)", marginLeft: "auto" }}>{sub}</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 'var(--space-1)' }}>{hint}</div>}
    </div>
  );
}

function Section({ id, title, desc, children }: { id: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card
      id={id} padding="none"
      style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-4)', scrollMarginTop: 80 }}
    >
      <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid var(--line-soft)" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-0)", marginBottom: 'var(--space-1)' }}>{title}</div>
        {desc && <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{desc}</div>}
      </div>
      {children}
    </Card>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      style={{
        width: 32,
        height: 18,
        borderRadius: 10,
        position: "relative",
        flexShrink: 0,
        cursor: "pointer",
        background: on ? "var(--lime)" : "var(--bg-3)",
        border: on ? "none" : "1px solid var(--line-soft)",
        padding: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: on ? "var(--primary-fg)" : "var(--ink-2)",
          transition: "left 120ms",
        }}
      />
    </button>
  );
}

function PickerRow<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${options.length}, 1fr)`,
        gap: 6,
      }}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            style={{
              padding: "10px 10px",
              fontSize: 12,
              borderRadius: 5,
              background: active ? "color-mix(in oklch, var(--lime) 8%, var(--bg-2))" : "var(--bg-2)",
              color: active ? "var(--ink-0)" : "var(--ink-2)",
              border: `1px solid ${active ? "var(--lime)" : "var(--line-soft)"}`,
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function newCategory(): CategoryRow {
  return { id: `c${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: "", slots: 50, filled: 0, req: "" };
}

function splitDtLocal(s: string): { date: string; time: string } {
  if (!s) return { date: "", time: "" };
  const i = s.indexOf("T");
  if (i < 0) return { date: s, time: "" };
  return { date: s.slice(0, i), time: s.slice(i + 1, i + 6) };
}

function joinDtLocal(date: string, time: string): string {
  if (!date) return "";
  return `${date}T${time || "00:00"}`;
}

function splitStartTime(ms: number): { date: string; time: string } {
  if (!ms) return { date: "", time: "06:00" };
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

export default function EventEditPage() {
  const { t } = useTranslation("event");
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const TYPE_OPTIONS = TYPE_DEFS.map((d) => ({ value: d.value, label: t(d.labelKey) }));
  const VISIBILITY_OPTIONS = VISIBILITY_DEFS.map((d) => ({ value: d.value, label: t(d.labelKey) }));
  const SECTIONS = SECTION_DEFS.map((s) => ({ id: s.id, label: t(s.labelKey) }));

  const [event, setEvent] = useState<{ id: string; status: Status; creatorId: string; hostIds: string[] } | null>(null);
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [initialData, setInitialData] = useState<FormData | null>(null);
  const [data, setData] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "warn" | "err"; msg: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [activeSection, setActiveSection] = useState<string>("basic");

  // load event
  const loadEvent = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const snap = await getDoc(doc(firestore, "events", eventId));
      if (!snap.exists()) {
        setEvent(null);
        return;
      }
      const d = snap.data();
      const info = d.info || {};
      const startMs = normalizeStartTime(info.startTime);
      const { date, time } = splitStartTime(startMs);

      // 카테고리 로드 + 신청수 집계
      const rawCategories: Array<{ id: string; name?: string; label?: string; capacity?: number; slots?: number; req?: string }> =
        Array.isArray(info.categories) && info.categories.length > 0 ? info.categories : [];
      const counts: Record<string, number> = {};
      try {
        const partsSnap = await getDocs(collection(firestore, `events/${eventId}/participants`));
        partsSnap.forEach((p) => {
          const cat = (p.data() as { category?: string }).category;
          if (cat) counts[cat] = (counts[cat] ?? 0) + 1;
        });
      } catch (err) {
        console.warn("참가자 집계 실패:", err);
      }

      const categories: CategoryRow[] = rawCategories.length
        ? rawCategories.map((c) => ({
            id: c.id,
            label: c.name ?? c.label ?? "",
            slots: typeof c.capacity === "number" ? c.capacity : typeof c.slots === "number" ? c.slots : 0,
            filled: counts[c.id] ?? 0,
            req: c.req ?? "",
          }))
        : [{ id: "c1", label: t("create.defaultCategory"), slots: info.settings?.maxParticipants || 50, filled: 0, req: "" }];

      const form: FormData = {
        name: info.name || "",
        type: (info.type as EventType) || "GRANFONDO",
        visibility: (info.visibility as Visibility) || "PUBLIC",
        description: info.description || "",
        hostName: info.hostName || "",
        hostPhone: info.hostPhone || "",
        date,
        startTime: time,
        meetLocation: info.meetLocation || (d.schedule?.meetLocation ?? ""),
        meetTime: info.meetTime || "",
        expectedDuration: info.expectedDuration || "",
        feeType: (info.feeType as FeeType) || (typeof info.entryFee === "number" && info.entryFee > 0 ? "PAID" : "FREE"),
        fee: typeof info.entryFee === "number" ? info.entryFee : 0,
        categories,
        openAt: info.openAt || "",
        closeAt: info.closeAt || "",
        cutoffEnabled: info.cutoff?.enabled ?? true,
        cutoffBuffer: typeof info.cutoff?.bufferMin === "number" ? info.cutoff.bufferMin : 30,
        sosEnabled: info.safety?.sos ?? true,
        liveTracking: info.safety?.liveTracking ?? true,
        mechanicalSag: info.safety?.mechanicalSag ?? false,
      };
      setInitialData(form);
      setData(form);

      setEvent({
        id: snap.id,
        status: (info.status as Status) || "UNKNOWN",
        creatorId: info.creatorId || "",
        hostIds: Array.isArray(info.hostIds) ? info.hostIds : [],
      });

      // 첫 코스만 표시 (변경 UI는 추후)
      const firstCourseId: string | undefined = Array.isArray(info.courseIds) ? info.courseIds[0] : undefined;
      if (firstCourseId) {
        try {
          const cs = await getDoc(doc(firestore, "courses", firstCourseId));
          if (cs.exists()) {
            const cd = cs.data();
            setCourse({
              id: cs.id,
              name: cd.name || cs.id,
              region: Array.isArray(cd.regions) && cd.regions.length > 0 ? cd.regions[0] : undefined,
              distance: typeof cd.distance === "number" ? cd.distance : undefined,
              elevationGain: typeof cd.elevationGain === "number" ? cd.elevationGain : undefined,
            });
          }
        } catch (err) {
          console.warn("코스 로드 실패:", err);
        }
      }
    } catch (err) {
      console.error("이벤트 조회 실패:", err);
      setLoadError(err instanceof Error ? err.message : t("edit.errLoad"));
    } finally {
      setLoading(false);
    }
  }, [eventId, t]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  // scroll spy
  useEffect(() => {
    const onScroll = () => {
      let current = "basic";
      for (const s of SECTION_DEFS) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top > 120) break;
        current = s.id;
      }
      setActiveSection(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
    // 스크롤 위치는 DOM에서 읽으므로 React 상태 의존성 불필요 — 마운트 시 1회 등록
  }, []);

  // dismiss toast
  useEffect(() => {
    if (!toast) return;
    const tid = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(tid);
  }, [toast]);

  // dirty
  const dirty = useMemo(() => {
    if (!initialData || !data) return false;
    return JSON.stringify(initialData) !== JSON.stringify(data);
  }, [initialData, data]);

  // 참가자에게 공지 필요한 필드
  const notifyDirty = useMemo(() => {
    if (!initialData || !data) return false;
    return (
      data.date !== initialData.date ||
      data.startTime !== initialData.startTime ||
      data.meetLocation !== initialData.meetLocation ||
      data.meetTime !== initialData.meetTime
    );
  }, [initialData, data]);

  const totalFilled = useMemo(
    () => (data?.categories ?? []).reduce((s, c) => s + (c.filled || 0), 0),
    [data]
  );
  const totalSlots = useMemo(
    () => (data?.categories ?? []).reduce((s, c) => s + Number(c.slots || 0), 0),
    [data]
  );

  const previousScrollRef = useRef(0);
  function scrollToSection(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    previousScrollRef.current = window.scrollY;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 60, behavior: "smooth" });
    setActiveSection(id);
  }

  function patch(p: Partial<FormData>) {
    setData((prev) => (prev ? { ...prev, ...p } : prev));
  }

  function updateCategory(id: string, p: Partial<CategoryRow>) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            categories: prev.categories.map((c) => (c.id === id ? { ...c, ...p } : c)),
          }
        : prev
    );
  }

  function removeCategory(id: string) {
    if (!data) return;
    const cat = data.categories.find((c) => c.id === id);
    if (cat?.filled && cat.filled > 0) {
      setToast({ type: "err", msg: t("confirm.deleteCategory") });
      return;
    }
    setData({ ...data, categories: data.categories.filter((c) => c.id !== id) });
  }

  function addCategory() {
    if (!data) return;
    setData({ ...data, categories: [...data.categories, newCategory()] });
  }

  function reset() {
    if (initialData) setData(initialData);
  }

  async function save() {
    if (!eventId || !data || saving) return;
    if (data.name.trim().length < 2) {
      setToast({ type: "err", msg: t("edit.errNameTooShort") });
      return;
    }
    setSaving(true);
    try {
      // date+startTime 합쳐 ms (KST)
      const KST_OFFSET = "+09:00";
      const startTimestamp =
        data.date && data.startTime
          ? new Date(`${data.date}T${data.startTime}:00${KST_OFFSET}`).getTime()
          : undefined;

      const fn = httpsCallable(functions, "updateEvent");
      await fn({
        eventId,
        name: data.name.trim(),
        description: data.description.trim(),
        type: data.type,
        visibility: data.visibility,
        hostName: data.hostName.trim(),
        hostPhone: data.hostPhone.trim(),
        ...(typeof startTimestamp === "number" ? { startTime: startTimestamp } : {}),
        meetLocation: data.meetLocation.trim(),
        meetTime: data.meetTime,
        expectedDuration: data.expectedDuration,
        categories: data.categories.map((c) => ({
          id: c.id,
          name: c.label.trim(),
          capacity: Number(c.slots) || 0,
          req: c.req.trim() || undefined,
        })),
        feeType: data.feeType,
        ...(data.feeType === "PAID" ? { entryFee: Number(data.fee) || 0 } : { entryFee: 0 }),
        openAt: data.openAt,
        closeAt: data.closeAt,
        cutoff: { enabled: data.cutoffEnabled, bufferMin: data.cutoffBuffer },
        safety: { sos: data.sosEnabled, liveTracking: data.liveTracking, mechanicalSag: data.mechanicalSag },
      });
      setInitialData(data);
      setToast({
        type: notifyDirty ? "warn" : "ok",
        msg: notifyDirty
          ? t("edit.savedWithNotice", { count: totalFilled })
          : t("edit.saved"),
      });
    } catch (err) {
      console.error("이벤트 저장 실패:", err);
      const fbErr = err as { code?: string; message?: string };
      const msg =
        fbErr?.code === "functions/permission-denied"
          ? t("edit.errPermission")
          : fbErr?.code === "functions/failed-precondition"
            ? t("edit.errAlreadyStarted")
            : t("edit.errSave");
      setToast({ type: "err", msg });
    } finally {
      setSaving(false);
    }
  }

  async function cancelEvent() {
    if (!eventId || !data) return;
    setDeleteConfirm(false);
    try {
      const fn = httpsCallable(functions, "updateEvent");
      await fn({ eventId, cancel: true });
      setToast({
        type: "warn",
        msg: t("edit.cancelledWithRefund", { count: totalFilled }),
      });
      setTimeout(() => navigate(`/event/${eventId}`), 1500);
    } catch (err) {
      console.error("이벤트 취소 실패:", err);
      setToast({ type: "err", msg: t("edit.errCancel") });
    }
  }

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <PermissionGate title={t("edit.permTitle")} description={t("edit.permDesc")} />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-6">
        <LoadingSkeleton kind="card" />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <ErrorState title={t("edit.loadErrTitle")} description={loadError} onRetry={loadEvent} />
      </div>
    );
  }
  if (!event || !data || !initialData) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon="🗓️"
          title={t("empty.noResults")}
          actions={[{ label: t("create.eventList"), variant: "primary", onClick: () => navigate("/events") }]}
        />
      </div>
    );
  }

  const isHost = user.uid === event.creatorId || event.hostIds.includes(user.uid);
  if (!isHost) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon="🔒"
          title={t("edit.noPermTitle")}
          description={t("edit.noPermDesc")}
          actions={[{ label: t("edit.viewEvent"), variant: "primary", onClick: () => navigate(`/event/${eventId}`) }]}
        />
      </div>
    );
  }
  if (event.status !== "DRAFT" && event.status !== "OPEN") {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon="⏱️"
          title={t("edit.lockedTitle")}
          description={t("edit.lockedDesc")}
          actions={[{ label: t("edit.viewEvent"), variant: "primary", onClick: () => navigate(`/event/${eventId}`) }]}
        />
      </div>
    );
  }

  const statusColor =
    event.status === "OPEN"
      ? "var(--aqua)"
      : event.status === "DRAFT"
      ? "var(--amber)"
      : "var(--ink-3)";

  return (
    <div style={{ paddingBottom: dirty ? 80 : 24 }}>
      {/* 상단 */}
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "var(--space-5) var(--space-6) var(--space-3)" }}>
        <div className="flex items-center" style={{ gap: 'var(--space-2)', fontSize: 11, color: "var(--ink-3)", marginBottom: 'var(--space-3)' }}>
          <Link to="/events" style={{ color: "var(--ink-3)" }}>{t("title")}</Link>
          <span style={{ color: "var(--ink-4)" }}>›</span>
          <Link to={`/event/${eventId}`} style={{ color: "var(--ink-3)" }} className="truncate">
            {data.name || event.id}
          </Link>
          <span style={{ color: "var(--ink-4)" }}>›</span>
          <span style={{ color: "var(--ink-2)" }}>{t("editTitle")}</span>
        </div>

        <div className="flex items-end justify-between flex-wrap" style={{ gap: 'var(--space-3)' }}>
          <div className="min-w-0">
            <div className="flex items-center" style={{ gap: 10, marginBottom: 6 }}>
              <Chip
                style={{
                  color: statusColor,
                  borderColor: `color-mix(in oklch, ${statusColor} 40%, var(--line-soft))`,
                  fontSize: 10,
                }}
              >
                {event.status}
              </Chip>
              <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{event.id}</span>
            </div>
            <h1 className="truncate" style={{ fontSize: 26, letterSpacing: "-0.02em", color: "var(--ink-0)" }}>
              {data.name}
            </h1>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 'var(--space-1)' }}>
              {t("edit.participantSummary", { filled: totalFilled, total: totalSlots, date: data.date, time: data.startTime })}
            </div>
          </div>
          <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
            <Button type="button" onClick={() => navigate(`/event/${eventId}`)} variant="secondary" size="sm">
              {t("preview")}
            </Button>
            <Button
              type="button"
              onClick={() => navigate(`/event/${eventId}/participants`)} variant="secondary" size="sm"
            >
              👥 {t("action.manageParticipants")}
            </Button>
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div
        className="event-edit-body"
        style={{
          maxWidth: 1160,
          margin: "0 auto",
          padding: "var(--space-4) var(--space-6)",
          display: "grid",
          gridTemplateColumns: "200px 1fr",
          gap: 'var(--space-6)',
          alignItems: "flex-start",
        }}
      >
        {/* 좌측 anchor nav */}
        <nav className="event-edit-nav" style={{ position: "sticky", top: 68 }}>
          <Text as="div" variant="eyebrow" style={{ marginBottom: 10 }}>{t("edit.navSections")}</Text>
          <div className="flex flex-col" style={{ gap: 2 }}>
            {SECTIONS.map((s) => {
              const active = activeSection === s.id;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection(s.id);
                  }}
                  style={{
                    padding: "8px 10px",
                    fontSize: 12,
                    borderRadius: 4,
                    textDecoration: "none",
                    color: active ? "var(--ink-0)" : "var(--ink-3)",
                    background: active ? "var(--bg-2)" : "transparent",
                    borderLeft: `2px solid ${active ? "var(--lime)" : "transparent"}`,
                  }}
                >
                  {s.label}
                </a>
              );
            })}
          </div>

          {notifyDirty && (
            <div
              style={{
                marginTop: 'var(--space-5)',
                padding: 'var(--space-3)',
                background: "color-mix(in oklch, var(--amber) 8%, var(--bg-2))",
                border: "1px solid color-mix(in oklch, var(--amber) 30%, var(--line-soft))",
                borderRadius: 5,
                fontSize: 11,
                color: "var(--ink-1)",
                lineHeight: 1.5,
              }}
            >
              <div className="flex items-center" style={{ gap: 6, marginBottom: 6, color: "var(--amber)", fontWeight: 500 }}>
                ⚠ {t("edit.noticeRequired")}
              </div>
              {t("edit.noticeWillSend", { count: totalFilled })}
            </div>
          )}
        </nav>

        {/* 우측 form */}
        <div>
          <Section id="basic" title={t("edit.section.basic")} desc={t("edit.sectionDesc.basic")}>
            <Field label={t("field.eventName")} required>
              <input
                type="text"
                value={data.name}
                onChange={(e) => patch({ name: e.target.value })}
                maxLength={40}
                style={fieldStyle}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label={t("field.eventType")} required>
                <PickerRow value={data.type} onChange={(v) => patch({ type: v })} options={TYPE_OPTIONS} />
              </Field>
              <Field label={t("field.visibility")} required>
                <PickerRow value={data.visibility} onChange={(v) => patch({ visibility: v })} options={VISIBILITY_OPTIONS} />
              </Field>
            </div>
            <Field label={t("field.description")} sub={`${data.description.length}/500`}>
              <textarea
                value={data.description}
                onChange={(e) => patch({ description: e.target.value.slice(0, 500) })}
                style={{ ...fieldStyle, minHeight: 90, resize: "vertical", lineHeight: 1.5 }}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label={t("field.hostName")} required>
                <input
                  type="text"
                  value={data.hostName}
                  onChange={(e) => patch({ hostName: e.target.value })}
                  style={fieldStyle}
                />
              </Field>
              <Field label={t("field.hostPhone")} required>
                <input
                  type="tel"
                  value={data.hostPhone}
                  onChange={(e) => patch({ hostPhone: e.target.value })}
                  style={fieldStyle}
                />
              </Field>
            </div>
          </Section>

          <Section id="course" title={t("edit.section.course")} desc={t("edit.sectionDesc.course")}>
            <Field label={t("field.course")} required>
              <div
                className="flex items-center"
                style={{
                  padding: 14,
                  background: "var(--bg-2)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 5,
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 80,
                    height: 50,
                    borderRadius: 4,
                    background: "var(--bg-3)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    fontSize: 18,
                    color: "var(--ink-3)",
                  }}
                  aria-hidden="true"
                >
                  🗺️
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[length:var(--fs-sm)] font-semibold truncate" style={{ color: "var(--ink-0)", marginBottom: 'var(--space-1)' }}>
                    {course?.name ?? t("edit.courseNotLinked")}
                  </div>
                  {course && (
                    <div className="flex flex-wrap" style={{ gap: 14, fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
                      {course.region && <span>{course.region}</span>}
                      {course.distance != null && <span>{(course.distance / 1000).toFixed(1)} km</span>}
                      {course.elevationGain != null && <span>↑ {Math.round(course.elevationGain).toLocaleString()} m</span>}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  onClick={() => alert(t("edit.courseChangeSoon"))} variant="secondary" size="sm"
                >
                  {t("button.edit")}
                </Button>
              </div>
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label={t("field.date")} required warn={data.date !== initialData.date}>
                <DateField
                  value={data.date}
                  onChange={(v) => patch({ date: v })}
                  placeholder={t("field.date")}
                />
              </Field>
              <Field label={t("field.startTime")} required warn={data.startTime !== initialData.startTime}>
                <TimeField
                  value={data.startTime}
                  onChange={(v) => patch({ startTime: v })}
                  placeholder={t("field.startTime")}
                />
              </Field>
            </div>

            <Field label={t("field.meetLocation")} required warn={data.meetLocation !== initialData.meetLocation}>
              <input
                type="text"
                value={data.meetLocation}
                onChange={(e) => patch({ meetLocation: e.target.value })}
                style={fieldStyle}
              />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label={t("field.meetTime")} warn={data.meetTime !== initialData.meetTime}>
                <TimeField
                  value={data.meetTime}
                  onChange={(v) => patch({ meetTime: v })}
                  placeholder={t("field.meetTime")}
                />
              </Field>
              <Field label={t("field.expectedDuration")}>
                <TimeField
                  value={data.expectedDuration}
                  onChange={(v) => patch({ expectedDuration: v })}
                  placeholder="HH:MM"
                />
              </Field>
            </div>
          </Section>

          <Section id="register" title={t("edit.section.register")} desc={t("edit.sectionDesc.register")}>
            <Field label={t("field.fee")} required>
              <div className="flex flex-wrap items-center" style={{ gap: 10 }}>
                <button
                  type="button"
                  onClick={() => patch({ feeType: "FREE", fee: 0 })}
                  aria-pressed={data.feeType === "FREE"}
                  style={{
                    padding: "10px 18px",
                    fontSize: 12,
                    borderRadius: 5,
                    background: data.feeType === "FREE" ? "color-mix(in oklch, var(--lime) 8%, var(--bg-2))" : "var(--bg-2)",
                    border: `1px solid ${data.feeType === "FREE" ? "var(--lime)" : "var(--line-soft)"}`,
                    color: data.feeType === "FREE" ? "var(--ink-0)" : "var(--ink-2)",
                    cursor: "pointer",
                  }}
                >
                  {t("feeType.free")}
                </button>
                <button
                  type="button"
                  onClick={() => patch({ feeType: "PAID" })}
                  aria-pressed={data.feeType === "PAID"}
                  style={{
                    padding: "10px 18px",
                    fontSize: 12,
                    borderRadius: 5,
                    background: data.feeType === "PAID" ? "color-mix(in oklch, var(--lime) 8%, var(--bg-2))" : "var(--bg-2)",
                    border: `1px solid ${data.feeType === "PAID" ? "var(--lime)" : "var(--line-soft)"}`,
                    color: data.feeType === "PAID" ? "var(--ink-0)" : "var(--ink-2)",
                    cursor: "pointer",
                  }}
                >
                  {t("feeType.paid")}
                </button>
                {data.feeType === "PAID" && (
                  <div className="flex items-center" style={{ gap: 'var(--space-2)', flex: 1 }}>
                    <input
                      type="number"
                      value={data.fee}
                      onChange={(e) => patch({ fee: Number(e.target.value) || 0 })}
                      style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                    />
                    <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("create.feeUnit")}</span>
                  </div>
                )}
              </div>
              {data.fee !== initialData.fee && event.status === "OPEN" && totalFilled > 0 && (
                <div
                  className="flex items-center"
                  style={{ marginTop: 'var(--space-2)', fontSize: 11, color: "var(--amber)", gap: 6 }}
                >
                  ⚠ {t("edit.feeChangeNotice", { count: totalFilled })}
                </div>
              )}
            </Field>

            <Field label={t("field.category")}>
              <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
                {data.categories.map((c) => {
                  const locked = c.filled > 0;
                  const pct = c.slots ? Math.min(100, Math.round((c.filled / c.slots) * 100)) : 0;
                  return (
                    <div
                      key={c.id}
                      style={{
                        padding: 10,
                        background: "var(--bg-2)",
                        border: "1px solid var(--line-soft)",
                        borderRadius: 5,
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 100px 1fr 32px",
                          gap: 'var(--space-2)',
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="text"
                          value={c.label}
                          onChange={(e) => updateCategory(c.id, { label: e.target.value })}
                          placeholder={t("create.ph.category")}
                          style={fieldStyle}
                        />
                        <input
                          type="number"
                          value={c.slots}
                          onChange={(e) => updateCategory(c.id, { slots: Number(e.target.value) || 0 })}
                          style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                        />
                        <input
                          type="text"
                          value={c.req}
                          onChange={(e) => updateCategory(c.id, { req: e.target.value })}
                          placeholder={t("edit.ph.req")}
                          style={fieldStyle}
                        />
                        <button
                          type="button"
                          onClick={() => removeCategory(c.id)}
                          disabled={locked}
                          title={locked ? t("edit.categoryLockedTitle") : t("message.removeCategory")}
                          aria-label={t("message.removeCategory")}
                          style={{
                            width: 32,
                            height: 34,
                            borderRadius: 5,
                            background: "var(--bg-3)",
                            border: "1px solid var(--line-soft)",
                            color: "var(--ink-3)",
                            display: "grid",
                            placeItems: "center",
                            opacity: locked ? 0.4 : 1,
                            cursor: locked ? "not-allowed" : "pointer",
                          }}
                        >
                          ×
                        </button>
                      </div>
                      <div className="flex items-center" style={{ gap: 10, marginTop: 'var(--space-2)' }}>
                        <div style={{ flex: 1, height: 3, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              background: pct > 85 ? "var(--amber)" : "var(--lime)",
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 10, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
                          {c.filled}/{c.slots} ({pct}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
                <Button type="button" onClick={addCategory} variant="secondary" size="sm" style={{ alignSelf: "flex-start" }}>
                  + {t("message.addCategory")}
                </Button>
              </div>
            </Field>

            {(() => {
              const open = splitDtLocal(data.openAt);
              const close = splitDtLocal(data.closeAt);
              return (
                <div className="flex flex-col" style={{ gap: 14 }}>
                  <Field label={t("field.openAt")} required>
                    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 'var(--space-2)' }}>
                      <DateField
                        value={open.date}
                        onChange={(v) => patch({ openAt: joinDtLocal(v, open.time) })}
                        placeholder={t("create.openDate")}
                      />
                      <TimeField
                        value={open.time}
                        onChange={(v) => patch({ openAt: joinDtLocal(open.date, v) })}
                        placeholder={t("create.timePh")}
                      />
                    </div>
                  </Field>
                  <Field label={t("field.closeAt")} required>
                    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 'var(--space-2)' }}>
                      <DateField
                        value={close.date}
                        onChange={(v) => patch({ closeAt: joinDtLocal(v, close.time) })}
                        min={open.date || undefined}
                        placeholder={t("create.closeDate")}
                      />
                      <TimeField
                        value={close.time}
                        onChange={(v) => patch({ closeAt: joinDtLocal(close.date, v) })}
                        placeholder={t("create.timePh")}
                      />
                    </div>
                  </Field>
                </div>
              );
            })()}

            <Field label={t("field.cutoff")} hint={t("hint.cutoff")}>
              <div
                className="flex items-center flex-wrap"
                style={{
                  gap: 14,
                  padding: "10px 12px",
                  background: "var(--bg-2)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 5,
                }}
              >
                <Toggle on={data.cutoffEnabled} onChange={(v) => patch({ cutoffEnabled: v })} />
                <span style={{ fontSize: 12, color: "var(--ink-1)" }}>{t("edit.cutoffApply")}</span>
                {data.cutoffEnabled && (
                  <>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{t("edit.cutoffBuffer")}</span>
                    <input
                      type="number"
                      value={data.cutoffBuffer}
                      onChange={(e) => patch({ cutoffBuffer: Number(e.target.value) || 0 })}
                      style={{ ...fieldStyle, width: 70, fontFamily: "var(--font-mono)" }}
                    />
                    <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{t("edit.cutoffMin")}</span>
                  </>
                )}
              </div>
            </Field>
          </Section>

          <Section id="safety" title={t("edit.section.safety")} desc={t("edit.sectionDesc.safety")}>
            {[
              {
                id: "sosEnabled" as const,
                label: t("message.sosEnabled"),
                desc: t("edit.safetyDesc.sos"),
              },
              {
                id: "liveTracking" as const,
                label: t("message.liveTrackingEnabled"),
                desc: t("edit.safetyDesc.liveTracking"),
              },
              {
                id: "mechanicalSag" as const,
                label: t("message.mechanicalSupport"),
                desc: t("edit.safetyDesc.mechanicalSag"),
              },
            ].map((opt) => (
              <div
                key={opt.id}
                className="flex items-start"
                style={{ gap: 14, padding: "10px 0", borderBottom: "1px solid var(--line-soft)" }}
              >
                <Toggle on={data[opt.id]} onChange={(v) => patch({ [opt.id]: v } as Partial<FormData>)} />
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 12, color: "var(--ink-0)", marginBottom: 2 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{opt.desc}</div>
                </div>
              </div>
            ))}
          </Section>

          <Section id="danger" title={t("edit.section.danger")} desc={t("edit.sectionDesc.danger")}>
            <div
              style={{
                padding: 'var(--space-4)',
                background: "color-mix(in oklch, var(--rose) 5%, var(--bg-2))",
                border: "1px solid color-mix(in oklch, var(--rose) 30%, var(--line-soft))",
                borderRadius: 5,
              }}
            >
              <div className="flex items-start" style={{ gap: 14 }}>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)", marginBottom: 'var(--space-1)' }}>
                    {t("edit.cancelEventTitle")}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.6 }}>
                    {t("edit.cancelEventDesc", { count: totalFilled })}
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    setDeleteConfirm(true);
                    setDeleteConfirmText("");
                  }} variant="secondary" size="sm"
                  style={{
                    background: "transparent",
                    color: "var(--rose)",
                    border: "1px solid color-mix(in oklch, var(--rose) 40%, transparent)",
                  }}
                >
                  {t("edit.cancelEventTitle")}
                </Button>
              </div>
            </div>
          </Section>
        </div>
      </div>

      {/* 하단 저장 바 */}
      {dirty && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "color-mix(in oklch, var(--bg-1) 95%, transparent)",
            backdropFilter: "blur(12px)",
            borderTop: "1px solid var(--line-soft)",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 'var(--space-3)',
            zIndex: 50,
          }}
        >
          <div
            className="flex items-center justify-between"
            style={{ maxWidth: 1160, width: "100%" }}
          >
            <div className="flex items-center" style={{ gap: 10, fontSize: 12, color: "var(--ink-1)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--amber)" }} aria-hidden="true" />
              {notifyDirty ? t("edit.unsavedWithNotice") : t("edit.unsaved")}
            </div>
            <div className="flex" style={{ gap: 'var(--space-2)' }}>
              <Button type="button" onClick={reset} variant="secondary" size="sm">
                {t("edit.revert")}
              </Button>
              <Button
                type="button"
                onClick={save} variant="primary" size="sm" className="disabled:opacity-50"
                disabled={saving}
              >
                {saving ? t("edit.saving") : `${t("message.saveChanges")} ✓`}
              </Button>
            </div>
          </div>
        </div>
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
            zIndex: 60,
          }}
        >
          <span aria-hidden="true">{toast.type === "ok" ? "✓" : "⚠"}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      {/* 취소 확인 모달 */}
      {deleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "grid",
            placeItems: "center",
            zIndex: 100,
          }}
          onClick={() => setDeleteConfirm(false)}
        >
          <Card padding="none"
            style={{ padding: 'var(--space-6)', maxWidth: 440, width: "90%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex" style={{ gap: 14, marginBottom: 14 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "color-mix(in oklch, var(--rose) 15%, var(--bg-2))",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  fontSize: 18,
                  color: "var(--rose)",
                }}
              >
                ⚠
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-0)", marginBottom: 6 }}>
                  {t("edit.confirmCancelTitle")}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>
                  {t("edit.confirmCancelDesc", { name: data.name, count: totalFilled })}
                </div>
              </div>
            </div>
            <Field label={t("edit.confirmNameLabel")}>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={data.name}
                style={fieldStyle}
              />
            </Field>
            <div className="flex justify-end" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
              <Button type="button" onClick={() => setDeleteConfirm(false)} variant="secondary" size="sm">
                {t("edit.goBack")}
              </Button>
              <Button
                type="button"
                onClick={cancelEvent}
                disabled={deleteConfirmText.trim() !== data.name} variant="secondary" size="sm" className="disabled:opacity-50"
                style={{
                  background: deleteConfirmText.trim() === data.name ? "var(--rose)" : "var(--bg-3)",
                  color: deleteConfirmText.trim() === data.name ? "#fff" : "var(--ink-3)",
                  border: "none",
                }}
              >
                {t("edit.cancelEventTitle")}
              </Button>
            </div>
          </Card>
        </div>
      )}

      <style>{`
        @media (max-width: 1024px) {
          .event-edit-body { grid-template-columns: 1fr !important; }
          .event-edit-nav { position: static !important; }
        }
      `}</style>
    </div>
  );
}
