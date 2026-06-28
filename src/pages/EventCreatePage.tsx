import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { httpsCallable } from "firebase/functions";
import { collection, query, where, getDocs } from "firebase/firestore";
import { functions, firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { DateField, TimeField, EmptyState } from "../components/redesign";
import { useCourses } from "../hooks/useCourses";
import { Button, Card, Text } from "../theme/components";
import { Field, SegmentedPicker, StepBar, fieldStyle } from "../features/event/form/eventFormControls";
import { joinDtLocal, newCategory, splitDtLocal, type CategoryRow } from "../features/event/form/eventFormUtils";

interface GroupInfo {
  id: string;
  name: string;
  memberCount: number;
}

type EventType = "GRANFONDO" | "TOUR" | "TT" | "TRAINING";
type Visibility = "PUBLIC" | "GROUP" | "PRIVATE";
type FeeType = "FREE" | "PAID";

interface FormData {
  // step 1
  name: string;
  type: EventType;
  visibility: Visibility;
  description: string;
  hostName: string;
  hostPhone: string;
  // step 2
  courseIds: string[];
  date: string;
  startTime: string;
  meetLocation: string;
  meetTime: string;
  expectedDuration: string;
  // step 3
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
  // 그룹 관련
  groupId: string;
  createNewGroup: boolean;
  // 운영 — 사이클 외 설정
  maxParticipants: number;
  offCourseThreshold: number;
}

const TYPE_DEFS: Array<{ value: EventType; labelKey: string; subKey: string }> = [
  { value: "GRANFONDO", labelKey: "type.granfondo", subKey: "create.typeSub.granfondo" },
  { value: "TOUR", labelKey: "type.tour", subKey: "create.typeSub.tour" },
  { value: "TT", labelKey: "type.timetrail", subKey: "create.typeSub.tt" },
  { value: "TRAINING", labelKey: "type.training", subKey: "create.typeSub.training" },
];

const VISIBILITY_DEFS: Array<{ value: Visibility; labelKey: string; subKey: string }> = [
  { value: "PUBLIC", labelKey: "visibility.public", subKey: "create.visSub.public" },
  { value: "GROUP", labelKey: "visibility.group", subKey: "create.visSub.group" },
  { value: "PRIVATE", labelKey: "visibility.private", subKey: "create.visSub.private" },
];

const STEP_KEYS = ["create.step.basic", "create.step.course", "create.step.entry"] as const;

export default function EventCreatePage() {
  const { t } = useTranslation("event");
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const TYPE_OPTIONS = TYPE_DEFS.map((d) => ({ value: d.value, label: t(d.labelKey), sub: t(d.subKey) }));
  const VISIBILITY_OPTIONS = VISIBILITY_DEFS.map((d) => ({ value: d.value, label: t(d.labelKey), sub: t(d.subKey) }));

  const [data, setData] = useState<FormData>({
    name: "",
    type: "GRANFONDO",
    visibility: "PUBLIC",
    description: "",
    hostName: "",
    hostPhone: "",
    courseIds: [],
    date: "",
    startTime: "06:00",
    meetLocation: "",
    meetTime: "05:30",
    expectedDuration: "06:00",
    feeType: "FREE",
    fee: 0,
    categories: [newCategory(t("create.defaultCategory"), 100, t("create.defaultReq"))],
    openAt: "",
    closeAt: "",
    cutoffEnabled: true,
    cutoffBuffer: 30,
    sosEnabled: true,
    liveTracking: true,
    mechanicalSag: false,
    groupId: "",
    createNewGroup: false,
    maxParticipants: 50,
    offCourseThreshold: 500,
  });

  const [step, setStep] = useState(0);
  const [maxVisitedStep, setMaxVisitedStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [createdAsDraft, setCreatedAsDraft] = useState(false);

  // 코스
  const { courses: availableCourses, loading: loadingCourses } = useCourses();
  const [courseSearch, setCourseSearch] = useState("");
  const [showCoursePicker, setShowCoursePicker] = useState(true);

  // 그룹
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const q = query(
          collection(firestore, "groups"),
          where("creatorId", "==", user.uid),
          where("isActive", "==", true)
        );
        const snap = await getDocs(q);
        const results: GroupInfo[] = snap.docs.map((d) => {
          const dd = d.data();
          return { id: d.id, name: dd.name || d.id, memberCount: dd.memberCount || 0 };
        });
        setGroups(results);
      } catch (err) {
        logClientError("EventCreatePage.loadGroups", err, { userId: user.uid });
      } finally {
        setLoadingGroups(false);
      }
    })();
  }, [user]);

  // hostName 기본값을 유저 닉네임으로 (한 번만)
  useEffect(() => {
    if (user && !data.hostName) {
      setData((prev) => ({ ...prev, hostName: user.displayName || prev.hostName }));
    }
     
  }, [user]);

  // 선택 코스
  const selectedCourses = useMemo(
    () => data.courseIds.map((id) => availableCourses.find((c) => c.id === id)).filter(Boolean) as Array<{ id: string; name: string; distance: number; elevationGain: number; regions?: string[] }>,
    [data.courseIds, availableCourses]
  );

  // 검증
  const valid1 = data.name.trim().length >= 2 && data.hostName.trim().length > 0 && data.hostPhone.trim().length > 0;
  const valid2 = data.courseIds.length > 0 && data.date.length > 0 && data.startTime.length > 0 && data.meetLocation.trim().length > 0;
  const valid3 = data.categories.every((c) => c.label.trim().length > 0 && Number(c.slots) > 0) && data.openAt.length > 0 && data.closeAt.length > 0;

  const canAdvance = step === 0 ? valid1 : step === 1 ? valid2 : valid3;
  const canSubmit = valid1 && valid2 && valid3;

  function patch(p: Partial<FormData>) {
    setData((prev) => ({ ...prev, ...p }));
  }

  function updateCategory(id: string, p: Partial<CategoryRow>) {
    setData((prev) => ({ ...prev, categories: prev.categories.map((c) => (c.id === id ? { ...c, ...p } : c)) }));
  }

  function removeCategory(id: string) {
    setData((prev) => ({ ...prev, categories: prev.categories.filter((c) => c.id !== id) }));
  }

  async function submit(asDraft: boolean) {
    if (submitting || !user) return;
    if (!asDraft && !canSubmit) return;
    if (asDraft && data.name.trim().length < 2) {
      setSubmitError(t("create.errDraftName"));
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const KST_OFFSET = "+09:00";
      const startTimestamp = data.date && data.startTime
        ? new Date(`${data.date}T${data.startTime}:00${KST_OFFSET}`).getTime()
        : Date.now();

      const totalSlots = data.categories.reduce((s, c) => s + Number(c.slots || 0), 0);

      const payload: Record<string, unknown> = {
        name: data.name.trim(),
        type: data.type,
        startTime: startTimestamp,
        maxParticipants: totalSlots > 0 ? totalSlots : data.maxParticipants,
        visibility: data.visibility,
        description: data.description.trim() || undefined,
        hostName: data.hostName.trim() || undefined,
        hostPhone: data.hostPhone.trim() || undefined,
        meetLocation: data.meetLocation.trim() || undefined,
        meetTime: data.meetTime || undefined,
        expectedDuration: data.expectedDuration || undefined,
        categories: data.categories.map((c) => ({
          id: c.id,
          name: c.label.trim(),
          capacity: Number(c.slots) || 0,
          req: c.req.trim() || undefined,
        })),
        feeType: data.feeType,
        ...(data.feeType === "PAID" ? { entryFee: Number(data.fee) || 0 } : {}),
        openAt: data.openAt || undefined,
        closeAt: data.closeAt || undefined,
        cutoff: { enabled: data.cutoffEnabled, bufferMin: data.cutoffBuffer },
        safety: {
          sos: data.sosEnabled,
          liveTracking: data.liveTracking,
          mechanicalSag: data.mechanicalSag,
        },
        isDraft: asDraft,
      };

      if (data.createNewGroup && !data.groupId) {
        payload.createGroup = { name: data.name.trim(), visibility: "public" };
      } else if (data.groupId) {
        payload.groupId = data.groupId;
      }
      if (data.type === "GRANFONDO") {
        payload.offCourseThreshold = data.offCourseThreshold;
      }
      if (data.courseIds.length > 0) {
        payload.courseIds = data.courseIds;
      }

      const fn = httpsCallable<unknown, { eventId: string }>(functions, "createEvent");
      const result = await fn(payload);
      setCreatedEventId(result.data.eventId);
      setCreatedAsDraft(asDraft);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("create.errCreate");
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-[var(--lime)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;

  // 완료 화면
  if (createdEventId) {
    return (
      <div style={{ maxWidth: 640, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "color-mix(in oklch, var(--lime) 15%, var(--bg-2))",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 20px",
            fontSize: 28,
            color: "var(--lime)",
          }}
        >
          ✓
        </div>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", marginBottom: 10, color: "var(--ink-0)" }}>
          {createdAsDraft ? t("message.draftSaved") : t("message.eventCreated")}
        </h1>
        <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 28 }}>
          {createdAsDraft
            ? t("create.draftDoneDesc")
            : t("create.publishedDesc", { name: data.name })}
        </div>
        <Card padding="none" style={{ padding: 'var(--space-5)', textAlign: "left", marginBottom: 'var(--space-5)' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-2)', fontSize: 12 }}>
            <span style={{ color: "var(--ink-3)" }}>{t("label.eventId")}</span>
            <span style={{ color: "var(--ink-0)", fontFamily: "var(--font-mono)" }}>{createdEventId}</span>
          </div>
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-2)', fontSize: 12 }}>
            <span style={{ color: "var(--ink-3)" }}>{t("create.statusLabel")}</span>
            <span style={{ color: createdAsDraft ? "var(--amber)" : "var(--aqua)", fontFamily: "var(--font-mono)" }}>
              {createdAsDraft ? "DRAFT" : "OPEN"}
            </span>
          </div>
          <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
            <span style={{ color: "var(--ink-3)" }}>{t("field.closeAt")}</span>
            <span style={{ color: "var(--ink-0)", fontFamily: "var(--font-mono)" }}>{data.closeAt || "–"}</span>
          </div>
        </Card>
        <div className="flex justify-center" style={{ gap: 10 }}>
          <Button
            type="button"
            onClick={() => navigate(`/event/${createdEventId}`)} variant="primary"
          >
            {t("create.viewEvent")}
          </Button>
          <Button type="button" onClick={() => navigate("/events")} variant="secondary">
            {t("create.eventList")}
          </Button>
        </div>
      </div>
    );
  }

  const totalSlots = data.categories.reduce((s, c) => s + Number(c.slots || 0), 0);
  const typeLabel = TYPE_OPTIONS.find((o) => o.value === data.type)?.label ?? "–";
  const visLabel = VISIBILITY_OPTIONS.find((v) => v.value === data.visibility)?.label ?? "–";
  const firstCourse = selectedCourses[0];

  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "var(--space-5) var(--space-6)" }}>
      {/* Breadcrumb */}
      <div className="flex items-center" style={{ gap: 'var(--space-2)', fontSize: 11, color: "var(--ink-3)", marginBottom: 'var(--space-4)' }}>
        <Link to="/events" style={{ color: "var(--ink-3)" }}>{t("title")}</Link>
        <span style={{ color: "var(--ink-4)" }}>›</span>
        <span style={{ color: "var(--ink-2)" }}>{t("createTitle")}</span>
      </div>

      {/* 헤더 */}
      <div className="flex items-end justify-between flex-wrap" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <div>
          <h1 style={{ fontSize: 26, letterSpacing: "-0.02em", marginBottom: 'var(--space-1)', color: "var(--ink-0)" }}>
            {t("createTitle")}
          </h1>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {t("create.headerDesc")}
          </div>
        </div>
        <Button
          type="button"
          onClick={() => submit(true)}
          disabled={submitting || data.name.trim().length < 2} variant="secondary" size="sm" className="disabled:opacity-50"
        >
          {t("message.saveDraft")}
        </Button>
      </div>

      {/* Body — 2-col */}
      <div
        className="event-create-body"
        style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 'var(--space-6)', alignItems: "flex-start" }}
      >
        <Card padding="none" style={{ padding: 'var(--space-6)' }}>
          <StepBar
            step={step}
            setStep={(n) => {
              if (n <= maxVisitedStep) setStep(n);
            }}
            maxStep={maxVisitedStep}
            stepKeys={STEP_KEYS}
          />

          {step === 0 && (
            <div>
              <Field label={t("field.eventName")} required hint={t("hint.eventName")}>
                <input
                  type="text"
                  value={data.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder={t("create.ph.name")}
                  maxLength={40}
                  style={fieldStyle}
                />
              </Field>

              <Field label={t("field.eventType")} required>
                <SegmentedPicker options={TYPE_OPTIONS} value={data.type} onChange={(v) => patch({ type: v })} columns={4} />
              </Field>

              <Field label={t("field.visibility")} required>
                <SegmentedPicker options={VISIBILITY_OPTIONS} value={data.visibility} onChange={(v) => patch({ visibility: v })} columns={3} />
              </Field>

              <Field
                label={t("field.description")}
                sub={`${data.description.length}/500`}
                hint={t("hint.description")}
              >
                <textarea
                  value={data.description}
                  onChange={(e) => patch({ description: e.target.value.slice(0, 500) })}
                  placeholder={t("create.ph.description")}
                  style={{ ...fieldStyle, minHeight: 90, resize: "vertical", lineHeight: 1.5 }}
                />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label={t("field.hostName")} required>
                  <input
                    type="text"
                    value={data.hostName}
                    onChange={(e) => patch({ hostName: e.target.value })}
                    placeholder={t("create.ph.hostName")}
                    style={fieldStyle}
                  />
                </Field>
                <Field label={t("field.hostPhone")} required>
                  <input
                    type="tel"
                    value={data.hostPhone}
                    onChange={(e) => patch({ hostPhone: e.target.value })}
                    placeholder={t("create.ph.hostPhone")}
                    style={fieldStyle}
                  />
                </Field>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <Field label={t("field.course")} required hint={t("hint.course")}>
                {selectedCourses.length > 0 && !showCoursePicker ? (
                  <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
                    {selectedCourses.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center"
                        style={{
                          gap: 14,
                          padding: 'var(--space-4)',
                          background: "color-mix(in oklch, var(--lime) 6%, var(--bg-2))",
                          border: "1px solid color-mix(in oklch, var(--lime) 30%, var(--line-soft))",
                          borderRadius: 6,
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
                            {c.name}
                          </div>
                          <div className="flex flex-wrap" style={{ gap: 14, fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
                            {c.regions && c.regions.length > 0 && <span>{c.regions.slice(0, 2).join(", ")}</span>}
                            <span>{(c.distance / 1000).toFixed(1)} km</span>
                            <span>↑ {Math.round(c.elevationGain).toLocaleString()} m</span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          onClick={() => patch({ courseIds: data.courseIds.filter((id) => id !== c.id) })} variant="secondary" size="sm"
                          aria-label={t("create.deselectCourse", { name: c.name })}
                        >
                          {t("action.removeCourse")}
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      onClick={() => setShowCoursePicker(true)} variant="secondary" size="sm"
                      style={{ alignSelf: "flex-start" }}
                    >
                      + {t("action.addCourse")}
                    </Button>
                  </div>
                ) : (
                  <div>
                    <div className="flex" style={{ gap: 'var(--space-2)', marginBottom: 10 }}>
                      <Button
                        type="button" variant="secondary" size="sm"
                        style={{ background: "var(--bg-3)", color: "var(--ink-0)" }}
                      >
                        {t("action.myCourses")}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => showToast(t("create.gpxSoon"), "info")} variant="secondary" size="sm"
                      >
                        {t("action.uploadGPX")}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => navigate("/course/create")} variant="secondary" size="sm"
                      >
                        {t("action.drawRoute")}
                      </Button>
                    </div>
                    {loadingCourses ? (
                      <div className="flex items-center" style={{ gap: 'var(--space-2)', padding: "8px 0", fontSize: 13, color: "var(--ink-3)" }}>
                        <div className="w-4 h-4 border-2 border-[var(--lime)] border-t-transparent rounded-full animate-spin" />
                        {t("message.loadingCourses")}
                      </div>
                    ) : availableCourses.length === 0 ? (
                      <EmptyState
                        icon="🗺️"
                        title={t("message.noCourses")}
                        description={t("create.noCourseDesc")}
                        actions={[{ label: `+ ${t("create.createCourse")}`, variant: "primary", href: "/course/create" }]}
                        compact
                      />
                    ) : (
                      <>
                        <input
                          type="search"
                          value={courseSearch}
                          onChange={(e) => setCourseSearch(e.target.value)}
                          placeholder={t("action.searchCourse")}
                          style={{ ...fieldStyle, marginBottom: 'var(--space-2)' }}
                        />
                        <div
                          className="flex flex-col"
                          style={{
                            gap: 6,
                            maxHeight: 260,
                            overflowY: "auto",
                            padding: 2,
                          }}
                        >
                          {availableCourses
                            .filter((c) => !data.courseIds.includes(c.id))
                            .filter((c) => {
                              const q = courseSearch.trim().toLowerCase();
                              if (!q) return true;
                              const text = `${c.name} ${c.regions?.join(" ") ?? ""}`.toLowerCase();
                              return text.includes(q);
                            })
                            .slice(0, 50)
                            .map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  patch({ courseIds: [...data.courseIds, c.id] });
                                  setShowCoursePicker(false);
                                }}
                                className="flex items-center"
                                style={{
                                  padding: "10px 12px",
                                  textAlign: "left",
                                  borderRadius: 5,
                                  background: "var(--bg-2)",
                                  border: "1px solid var(--line-soft)",
                                  gap: 'var(--space-3)',
                                  cursor: "pointer",
                                }}
                              >
                                <div
                                  style={{
                                    width: 40,
                                    height: 28,
                                    background: "var(--bg-3)",
                                    borderRadius: 3,
                                    flexShrink: 0,
                                  }}
                                  aria-hidden="true"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-[length:var(--fs-xs)] font-semibold truncate" style={{ color: "var(--ink-0)", marginBottom: 2 }}>
                                    {c.name}
                                  </div>
                                  <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
                                    {c.regions && c.regions.length > 0 ? `${c.regions.slice(0, 2).join(", ")} · ` : ""}
                                    {(c.distance / 1000).toFixed(1)} km · ↑{Math.round(c.elevationGain).toLocaleString()} m
                                  </div>
                                </div>
                              </button>
                            ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label={t("field.date")} required>
                  <DateField value={data.date} onChange={(v) => patch({ date: v })} min={new Date().toISOString().split("T")[0]} placeholder={t("field.date")} />
                </Field>
                <Field label={t("field.startTime")} required>
                  <TimeField value={data.startTime} onChange={(v) => patch({ startTime: v })} placeholder={t("field.startTime")} />
                </Field>
              </div>

              <Field label={t("field.meetLocation")} required hint={t("hint.meetLocation")}>
                <input
                  type="text"
                  value={data.meetLocation}
                  onChange={(e) => patch({ meetLocation: e.target.value })}
                  placeholder={t("create.ph.meetLocation")}
                  style={fieldStyle}
                />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label={t("field.meetTime")} sub={t("create.meetTimeHint")}>
                  <TimeField value={data.meetTime} onChange={(v) => patch({ meetTime: v })} placeholder={t("field.meetTime")} />
                </Field>
                <Field label={t("field.expectedDuration")} hint={t("hint.expectedDuration")}>
                  <TimeField value={data.expectedDuration} onChange={(v) => patch({ expectedDuration: v })} placeholder="HH:MM" />
                </Field>
              </div>

              {/* 그룹 (옵션) */}
              <Field label={t("create.hostGroup")} sub={t("create.optional")}>
                <label className="flex items-start" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-2)', cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={data.createNewGroup}
                    onChange={(e) => {
                      patch({ createNewGroup: e.target.checked, groupId: e.target.checked ? "" : data.groupId });
                    }}
                    style={{ marginTop: 'var(--space-1)' }}
                  />
                  <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-1)" }}>
                    {t("create.createGroupPre")}<span style={{ color: "var(--lime)", fontWeight: 600 }}>{t("create.createGroupHi")}</span>{t("create.createGroupPost")}
                  </span>
                </label>
                {!data.createNewGroup && (
                  loadingGroups ? (
                    <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("create.loadingGroups")}</div>
                  ) : groups.length > 0 ? (
                    <select
                      value={data.groupId}
                      onChange={(e) => patch({ groupId: e.target.value })}
                      style={fieldStyle}
                    >
                      <option value="">{t("create.noHostGroup")}</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                          {g.memberCount > 0 ? ` (${t("create.members", { count: g.memberCount })})` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("create.noLeaderGroups")}</div>
                  )
                )}
              </Field>
            </div>
          )}

          {step === 2 && (
            <div>
              <Field label={t("field.fee")} required>
                <div className="flex flex-wrap items-center" style={{ gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => patch({ feeType: "FREE", fee: 0 })}
                    aria-pressed={data.feeType === "FREE"}
                    style={{
                      padding: "12px 18px",
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
                      padding: "12px 18px",
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
                        placeholder={t("create.ph.fee")}
                        style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                      />
                      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("create.feeUnit")}</span>
                    </div>
                  )}
                </div>
              </Field>

              <Field
                label={t("field.category")}
                required
                hint={t("hint.categories")}
              >
                <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
                  {data.categories.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 100px 1fr 32px",
                        gap: 'var(--space-2)',
                        alignItems: "center",
                        padding: 10,
                        background: "var(--bg-2)",
                        border: "1px solid var(--line-soft)",
                        borderRadius: 5,
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
                        placeholder={t("create.ph.slots")}
                        style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                      />
                      <input
                        type="text"
                        value={c.req}
                        onChange={(e) => updateCategory(c.id, { req: e.target.value })}
                        placeholder={t("create.ph.req")}
                        style={fieldStyle}
                      />
                      <button
                        type="button"
                        onClick={() => removeCategory(c.id)}
                        disabled={data.categories.length <= 1}
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
                          opacity: data.categories.length <= 1 ? 0.4 : 1,
                          cursor: data.categories.length <= 1 ? "not-allowed" : "pointer",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    onClick={() =>
                      setData((prev) => ({
                        ...prev,
                        categories: [...prev.categories, newCategory("", 50, "")],
                      }))
                    } variant="secondary" size="sm"
                    style={{ alignSelf: "flex-start" }}
                  >
                    + {t("message.addCategory")}
                  </Button>
                </div>
                <div className="flex justify-between" style={{ marginTop: 'var(--space-2)', fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
                  <span>{t("create.totalSlots", { count: totalSlots })}</span>
                  <span>{t("create.categoryCount", { count: data.categories.length })}</span>
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
                <div className="flex flex-wrap items-center" style={{ gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => patch({ cutoffEnabled: !data.cutoffEnabled })}
                    aria-pressed={data.cutoffEnabled}
                    style={{
                      padding: "8px 14px",
                      fontSize: 12,
                      borderRadius: 5,
                      background: data.cutoffEnabled ? "color-mix(in oklch, var(--lime) 8%, var(--bg-2))" : "var(--bg-2)",
                      border: `1px solid ${data.cutoffEnabled ? "var(--lime)" : "var(--line-soft)"}`,
                      color: data.cutoffEnabled ? "var(--ink-0)" : "var(--ink-2)",
                      cursor: "pointer",
                    }}
                  >
                    {data.cutoffEnabled ? t("create.cutoffOn") : t("create.cutoffOff")}
                  </button>
                  {data.cutoffEnabled && (
                    <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      {t("create.cutoffBufferPre")}
                      <input
                        type="number"
                        value={data.cutoffBuffer}
                        onChange={(e) => patch({ cutoffBuffer: Number(e.target.value) || 0 })}
                        style={{ ...fieldStyle, width: 64, padding: "var(--space-1) var(--space-2)", margin: "0 4px", display: "inline-block" }}
                      />
                      {t("create.cutoffBufferPost")}
                    </span>
                  )}
                </div>
              </Field>

              <Field label={t("field.safety")}>
                {[
                  {
                    id: "sosEnabled" as const,
                    label: t("message.sosEnabled"),
                    desc: t("create.sosDesc"),
                  },
                  {
                    id: "liveTracking" as const,
                    label: t("message.liveTrackingEnabled"),
                    desc: t("create.liveTrackingDesc"),
                  },
                  {
                    id: "mechanicalSag" as const,
                    label: t("message.mechanicalSupport"),
                    desc: t("create.mechanicalSagDesc"),
                  },
                ].map((opt) => {
                  const checked = data[opt.id];
                  return (
                    <label
                      key={opt.id}
                      className="flex"
                      style={{
                        gap: 'var(--space-3)',
                        padding: "10px 12px",
                        marginBottom: 6,
                        background: "var(--bg-2)",
                        border: "1px solid var(--line-soft)",
                        borderRadius: 5,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => patch({ [opt.id]: e.target.checked } as Partial<FormData>)}
                        className="sr-only"
                      />
                      <div
                        aria-hidden="true"
                        style={{
                          width: 32,
                          height: 18,
                          borderRadius: 10,
                          position: "relative",
                          flexShrink: 0,
                          marginTop: 2,
                          background: checked ? "var(--lime)" : "var(--bg-3)",
                          border: checked ? "none" : "1px solid var(--line-soft)",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: 2,
                            left: checked ? 16 : 2,
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            background: checked ? "var(--primary-fg)" : "var(--ink-2)",
                            transition: "left 120ms",
                          }}
                        />
                      </div>
                      <div>
                        <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-0)", marginBottom: 2 }}>{opt.label}</div>
                        <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{opt.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </Field>
            </div>
          )}

          {/* Error */}
          {submitError && (
            <div
              role="alert"
              style={{
                marginTop: 'var(--space-4)',
                padding: 'var(--space-3)',
                background: "color-mix(in oklch, var(--rose) 12%, var(--bg-2))",
                border: "1px solid color-mix(in oklch, var(--rose) 30%, transparent)",
                borderRadius: 5,
              }}
            >
              <p className="text-[length:var(--fs-xs)]" style={{ color: "var(--rose)", margin: 0 }}>{submitError}</p>
            </div>
          )}

          {/* Navigation */}
          <div
            className="flex items-center justify-between"
            style={{ gap: 'var(--space-3)', paddingTop: 'var(--space-5)', marginTop: 'var(--space-5)', borderTop: "1px solid var(--line-soft)" }}
          >
            <Button
              type="button"
              onClick={() => (step === 0 ? navigate(-1) : setStep(step - 1))}
              disabled={submitting} variant="secondary" size="sm"
            >
              {step === 0 ? t("message.cancel") : `← ${t("create.prev")}`}
            </Button>
            {step < 2 ? (
              <Button
                type="button"
                onClick={() => {
                  if (!canAdvance) return;
                  const next = step + 1;
                  setStep(next);
                  setMaxVisitedStep(Math.max(maxVisitedStep, next));
                }}
                disabled={!canAdvance} variant="primary" className="disabled:opacity-50"
              >
                {t("create.next")} →
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => submit(false)}
                disabled={!canSubmit || submitting} variant="primary" className="disabled:opacity-50"
              >
                {submitting ? t("create.publishing") : `${t("create.publishCta")} ✓`}
              </Button>
            )}
          </div>
        </Card>

        {/* Sidebar — Summary */}
        <Card padding="none" className="event-create-aside"
          style={{ padding: 18, position: "sticky", top: 68 }}
        >
          <Text as="div" variant="eyebrow" style={{ marginBottom: 10 }}>{t("preview")}</Text>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-0)", marginBottom: 'var(--space-1)', minHeight: 20 }}>
            {data.name || <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>{t("create.ph.eventName")}</span>}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)", marginBottom: 14 }}>
            {data.date ? `${data.date} ${data.startTime || ""}` : t("create.dateTbd")}
          </div>

          <dl
            className="flex flex-col"
            style={{
              gap: 'var(--space-2)',
              fontSize: 11,
              paddingTop: 14,
              borderTop: "1px solid var(--line-soft)",
              margin: 0,
            }}
          >
            {[
              [t("create.sum.type"), typeLabel],
              [t("create.sum.visibility"), visLabel],
              [t("create.sum.course"), firstCourse?.name || t("create.notSelected")],
              [t("create.sum.distance"), firstCourse ? `${(firstCourse.distance / 1000).toFixed(1)} km` : "–"],
              [t("create.sum.elevation"), firstCourse ? `↑ ${Math.round(firstCourse.elevationGain).toLocaleString()} m` : "–"],
              [t("create.sum.slots"), totalSlots ? t("create.members", { count: totalSlots }) : "–"],
              [t("create.sum.categories"), t("create.itemCount", { count: data.categories.length })],
              [t("create.sum.fee"), data.feeType === "FREE" ? t("feeType.free") : data.fee ? `₩ ${Number(data.fee).toLocaleString("ko-KR")}` : "–"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between" style={{ gap: 10 }}>
                <dt style={{ color: "var(--ink-3)" }}>{k}</dt>
                <dd style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)", textAlign: "right", margin: 0 }}>{v}</dd>
              </div>
            ))}
          </dl>

          <div
            style={{
              marginTop: 18,
              paddingTop: 14,
              borderTop: "1px solid var(--line-soft)",
              fontSize: 10,
              color: "var(--ink-3)",
              lineHeight: 1.5,
            }}
          >
            {t("create.previewFooter")}
          </div>
        </Card>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .event-create-body { grid-template-columns: 1fr !important; }
          .event-create-aside { position: static !important; }
        }
      `}</style>
    </div>
  );
}
