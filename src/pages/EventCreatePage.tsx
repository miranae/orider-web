import "./EventControls.css";
import GlossaryProvider from "../components/common/GlossaryProvider";
import GlossaryText from "../components/common/GlossaryText";
import { CalendarDays, Clock3, Map } from "lucide-react";
import "./ExploreReview.css";
import { localeTag } from "../utils/localeDate";
import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, query, where, getDocs } from "firebase/firestore";
import { auth, functions, firestore, getAppCheckToken } from "../services/firebase";
import { isEmulatorRuntime } from "../services/runtimeConfig";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import { DateField, TimeField, EmptyState, PermissionGate } from "../components/redesign";
import { useCourses } from "../hooks/useCourses";
import { Button, Card, Text, Input, Textarea, DropdownSelect } from "../theme/components";
import { Field, SegmentedPicker, StepBar, Toggle, fieldStyle } from "../features/event/form/eventFormControls";
import { createEventSeriesId, joinDtLocal, newCategory, shiftDtLocalByWeeks, splitDtLocal, type CategoryRow } from "../features/event/form/eventFormUtils";
import { ICON_SIZE } from "../theme/tokens/icon";

const REPEAT_WEEK_OPTIONS = [2, 4, 8] as const;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface RepeatSummary {
  totalWeeks: number;
  successCount: number;
  failedCount: number;
}

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
  // 반복(정기) 일정 — 매주 같은 요일·시간으로 N주치 이벤트를 생성
  repeatEnabled: boolean;
  repeatWeeks: number;
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
  const { user, loading: authLoading, signIn } = useAuth();

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedGroupId = searchParams.get("groupId");
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
    repeatEnabled: false,
    repeatWeeks: 4,
    maxParticipants: 50,
    offCourseThreshold: 500,
  });

  const [step, setStep] = useState(0);
  const [maxVisitedStep, setMaxVisitedStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [createdAsDraft, setCreatedAsDraft] = useState(false);
  const [repeatSummary, setRepeatSummary] = useState<RepeatSummary | null>(null);
  const [failedRepeatPayloads, setFailedRepeatPayloads] = useState<Record<string, unknown>[]>([]);
  const [retryingRepeat, setRetryingRepeat] = useState(false);
  const createGeneration = useRef(0);
  const createMounted = useRef(false);
  const pendingCreate = useRef<{ uid: string; generation: number } | null>(null);
  const failedRepeatOwner = useRef<string | null>(null);

  useEffect(() => {
    createMounted.current = true;
    const unsubscribe = onAuthStateChanged(auth, () => {
      createGeneration.current += 1;
      pendingCreate.current = null;
      setSubmitting(false);
      setRetryingRepeat(false);
    });
    return () => {
      unsubscribe();
      createMounted.current = false;
      createGeneration.current += 1;
      pendingCreate.current = null;
    };
  }, []);

  function currentCreate(context: { uid: string; generation: number }): boolean {
    return createMounted.current && context.generation === createGeneration.current
      && auth.currentUser?.uid === context.uid;
  }

  async function readyCreate(context: { uid: string; generation: number }) {
    if (!currentCreate(context)) throw new Error("functions/unauthenticated");
    const token = await getAppCheckToken();
    if (!token && !isEmulatorRuntime()) throw new Error("app-check/empty-token");
    if (!currentCreate(context)) throw new Error("functions/unauthenticated");
    return httpsCallable<unknown, { eventId: string }>(functions, "createEvent");
  }


  // 코스
  const { courses: availableCourses, loading: loadingCourses, hasMore: hasMoreCourses, loadingMore: loadingMoreCourses, loadMore: loadMoreCourses } = useCourses();
  const [courseSearch, setCourseSearch] = useState("");
  const [showCoursePicker, setShowCoursePicker] = useState(true);

  // 그룹
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [groupsLoadedFor, setGroupsLoadedFor] = useState("");
  const [recoveredGroupContext, setRecoveredGroupContext] = useState("");

  useEffect(() => {
    let cancelled = false;
    setGroups([]); setLoadingGroups(true); setGroupsLoadedFor("");
    if (!user) { setLoadingGroups(false); return; }
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
        if (cancelled) return;
        setGroups(results); setGroupsLoadedFor(user.uid);
        if (requestedGroupId && results.some(group => group.id === requestedGroupId)) {
          setData(previous => previous.groupId || previous.createNewGroup ? previous : { ...previous, groupId: requestedGroupId });
        }
      } catch (err) {
        if (cancelled) return;
        logClientError("EventCreatePage.loadGroups", err, { userId: user.uid });
      } finally {
        if (!cancelled) setLoadingGroups(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, requestedGroupId]);

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
  const validRegistrationWindow = data.openAt.length > 0 && data.closeAt.length > 0 && new Date(data.closeAt).getTime() > new Date(data.openAt).getTime();
  const valid3 = data.categories.every((c) => c.label.trim().length > 0 && Number(c.slots) > 0) && validRegistrationWindow;

  const groupContext = `${user?.uid}:${requestedGroupId}`;
  const groupContextReady = !requestedGroupId || (!loadingGroups && groupsLoadedFor === user?.uid
    && groups.some(group => group.id === data.groupId)
    && (data.groupId === requestedGroupId || recoveredGroupContext === groupContext));
  const canAdvance = groupContextReady && (step === 0 ? valid1 : step === 1 ? valid2 : valid3);
  const canSubmit = groupContextReady && valid1 && valid2 && valid3;
  function recoverPublicCreate() {
    setData(previous => ({ ...previous, groupId: "", createNewGroup: false, visibility: "PUBLIC" }));
    setSearchParams(previous => { const next = new URLSearchParams(previous); next.delete("groupId"); return next; }, { replace: true });
  }

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
    if (!groupContextReady || submitting || pendingCreate.current || !user || auth.currentUser?.uid !== user.uid) return;
    if (!asDraft && !canSubmit) return;
    if (asDraft && data.name.trim().length < 2) {
      setSubmitError(t("create.errDraftName"));
      return;
    }
    const context = { uid: user.uid, generation: createGeneration.current };
    pendingCreate.current = context;
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
      if (!asDraft && data.repeatEnabled && data.repeatWeeks > 1) {
        payload.seriesId = createEventSeriesId();
        payload.round = 1;
      }

      const fn = await readyCreate(context);
      const result = await fn(payload);
      if (!currentCreate(context)) return;
      const firstEventId = result.data.eventId;

      // 반복(정기) 일정 — 초안이 아닐 때만, 기존/신규 그룹과 관계없이 매주 N-1회 추가 생성.
      // createEvent 응답은 eventId만 반환하므로(신규 그룹 생성 시 groupId 미포함) 첫 이벤트 문서를
      // 읽어(rules상 events는 read: true) 실제 groupId를 확인한 뒤 나머지 회차에 재사용한다.
      let summary: RepeatSummary | null = null;
      if (!asDraft && data.repeatEnabled && data.repeatWeeks > 1) {
        let seriesGroupId = data.groupId || null;
        if (!seriesGroupId && data.createNewGroup) {
          try {
            const createdSnap = await getDoc(doc(firestore, "events", firstEventId));
            const fetchedGroupId = createdSnap.data()?.info?.groupId;
            if (typeof fetchedGroupId === "string" && fetchedGroupId) seriesGroupId = fetchedGroupId;
          } catch (err) {
            logClientError("EventCreatePage.repeatSeries.readGroupId", err, { eventId: firstEventId });
          }
        }

        const { createGroup: _createGroup, ...basePayload } = payload as Record<string, unknown>;
        let successCount = 1;
        let failedCount = 0;
        const failedPayloads: Record<string, unknown>[] = [];
        for (let i = 1; i < data.repeatWeeks; i++) {
          const weekPayload: Record<string, unknown> = {
            ...basePayload,
            round: i + 1,
            startTime: startTimestamp + i * WEEK_MS,
            ...(data.openAt ? { openAt: shiftDtLocalByWeeks(data.openAt, i) } : {}),
            ...(data.closeAt ? { closeAt: shiftDtLocalByWeeks(data.closeAt, i) } : {}),
            ...(seriesGroupId ? { groupId: seriesGroupId } : {}),
          };
          if (!currentCreate(context)) return;
          try {
            await fn(weekPayload);
            if (!currentCreate(context)) return;
            successCount += 1;
          } catch (err) {
            if (!currentCreate(context)) return;
            failedCount += 1;
            failedPayloads.push(weekPayload);
            logClientError("EventCreatePage.repeatSeries.createWeek", err, { week: i });
          }
        }
        summary = { totalWeeks: data.repeatWeeks, successCount, failedCount };
        failedRepeatOwner.current = context.uid;
        setFailedRepeatPayloads(failedPayloads);
      }

      if (!currentCreate(context)) return;
      setCreatedEventId(firstEventId);
      setCreatedAsDraft(asDraft);
      setRepeatSummary(summary);
    } catch (err: unknown) {
      if (!currentCreate(context)) return;
      const msg = err instanceof Error ? err.message : t("create.errCreate");
      setSubmitError(msg);
    } finally {
      if (pendingCreate.current === context) {
        pendingCreate.current = null;
        if (currentCreate(context)) setSubmitting(false);
      }
    }
  }

  async function retryFailedRepeats() {
    if (!repeatSummary || failedRepeatPayloads.length === 0 || pendingCreate.current || !user
      || auth.currentUser?.uid !== user.uid || failedRepeatOwner.current !== user.uid) return;
    const context = { uid: user.uid, generation: createGeneration.current };
    pendingCreate.current = context;
    setRetryingRepeat(true);
    try {
      const fn = await readyCreate(context);
      const stillFailed: Record<string, unknown>[] = [];
      let recovered = 0;
      for (const payload of failedRepeatPayloads) {
        if (!currentCreate(context)) return;
        try { await fn(payload); recovered += 1; }
        catch (err) {
          if (!currentCreate(context)) return;
          stillFailed.push(payload);
          logClientError("EventCreatePage.repeatSeries.retryWeek", err, { round: payload.round });
        }
      }
      if (!currentCreate(context)) return;
      setFailedRepeatPayloads(stillFailed);
      setRepeatSummary({ ...repeatSummary, successCount: repeatSummary.successCount + recovered, failedCount: stillFailed.length });
    } catch (err) {
      if (currentCreate(context)) setSubmitError(err instanceof Error ? err.message : t("create.errCreate"));
    } finally {
      if (pendingCreate.current === context) {
        pendingCreate.current = null;
        if (currentCreate(context)) setRetryingRepeat(false);
      }
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-[var(--lime)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <div className="event-controls-surface explore-editor-surface max-w-xl mx-auto py-16"><PermissionGate title={t("participantsView.loginRequired")} actionLabel={t("common:button.loginGoogle")} onAction={() => { void signIn(); }} /></div>;

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
            fontSize: "var(--fs-3xl)",
            color: "var(--lime)",
          }}
        >
          ✓
        </div>
        <h1 style={{ fontSize: "var(--fs-3xl)", letterSpacing: "-0.02em", marginBottom: "var(--space-2)", color: "var(--ink-0)" }}>
          {createdAsDraft ? t("message.draftSaved") : t("message.eventCreated")}
        </h1>
        <div style={{ fontSize: "var(--ft-body-size)", color: "var(--ink-3)", marginBottom: "var(--space-7)" }}>
          {createdAsDraft
            ? t("create.draftDoneDesc")
            : t("create.publishedDesc", { name: data.name })}
        </div>
        <Card padding="none" style={{ padding: 'var(--space-5)', textAlign: "left", marginBottom: 'var(--space-5)' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-2)', fontSize: "var(--ft-body-size)" }}>
            <span style={{ color: "var(--ink-3)" }}>{t("label.eventId")}</span>
            <span style={{ color: "var(--ink-0)", fontFamily: "var(--font-code)" }}>{createdEventId}</span>
          </div>
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-2)', fontSize: "var(--ft-body-size)" }}>
            <span style={{ color: "var(--ink-3)" }}>{t("create.statusLabel")}</span>
            <span style={{ color: createdAsDraft ? "var(--amber)" : "var(--aqua)", fontFamily: "var(--font-mono)" }}>
              {createdAsDraft ? "DRAFT" : "OPEN"}
            </span>
          </div>
          <div className="flex items-center justify-between" style={{ fontSize: "var(--ft-body-size)" }}>
            <span style={{ color: "var(--ink-3)" }}>{t("field.closeAt")}</span>
            <span style={{ color: "var(--ink-0)", fontFamily: "var(--font-mono)" }}>{data.closeAt || "–"}</span>
          </div>
        </Card>
        {repeatSummary && (
          <Card
            padding="none"
            style={{
              padding: 'var(--space-4)',
              textAlign: "left",
              marginBottom: 'var(--space-5)',
              background: repeatSummary.failedCount > 0 ? "color-mix(in oklch, var(--amber) 8%, var(--bg-2))" : undefined,
              border: repeatSummary.failedCount > 0 ? "1px solid color-mix(in oklch, var(--amber) 30%, transparent)" : undefined,
            }}
          >
            <div className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-1)" }}>
              {t("create.repeat.summary", { success: repeatSummary.successCount, total: repeatSummary.totalWeeks })}
            </div>
            {repeatSummary.failedCount > 0 && (
              <div className="text-[length:var(--ft-body-size)]" style={{ color: "var(--amber)", marginTop: 'var(--space-1)' }}>
                {t("create.repeat.partialFail", { count: repeatSummary.failedCount })}
                <Button type="button" variant="secondary" disabled={retryingRepeat} onClick={retryFailedRepeats}>
                  {t("create.repeat.retryFailed")}
                </Button>
              </div>
            )}
          </Card>
        )}
        <div className="flex justify-center" style={{ gap: "var(--space-2)" }}>
          <Button
            type="button"
            onClick={() => navigate(`/event/${createdEventId}`)} variant="primary"
          >
            {t("create.viewEvent")}
          </Button>
          <Button type="button" onClick={() => navigate("/explore/events")} variant="secondary">
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
    <GlossaryProvider scopeKey="event-editor">
    <div className="event-controls-surface explore-editor-surface event-create-surface" style={{ maxWidth: 1160, margin: "0 auto", padding: "var(--space-5) var(--space-6)" }}>
      {/* Breadcrumb */}
      <div className="flex items-center" style={{ gap: 'var(--space-2)', fontSize: "var(--ft-body-size)", color: "var(--ink-3)", marginBottom: 'var(--space-4)' }}>
        <Link to="/explore/events" style={{ color: "var(--ink-3)" }}>{t("title")}</Link>
        <span style={{ color: "var(--ink-4)" }}>›</span>
        <span style={{ color: "var(--ink-2)" }}>{t("createTitle")}</span>
      </div>

      {/* 헤더 */}
      <div className="flex items-end justify-between flex-wrap" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <div>
          <h1 style={{ fontSize: "var(--fs-2xl)", letterSpacing: "-0.02em", marginBottom: 'var(--space-1)', color: "var(--ink-0)" }}>
            {t("createTitle")}
          </h1>
          <div style={{ fontSize: "var(--ft-body-size)", color: "var(--ink-3)" }}>
            {t("create.headerDesc")}
          </div>
        </div>
        <Button
          type="button"
          onClick={() => submit(true)}
          disabled={!groupContextReady || submitting || data.name.trim().length < 2} variant="secondary" size="sm" className="disabled:opacity-50"
        >
          {t("message.saveDraft")}
        </Button>
      </div>

      {/* Body — 2-col */}
      <div
        className="event-create-body"
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 'var(--space-6)', alignItems: "flex-start" }}
      >
        <Card padding="none" className="event-create-main" style={{ padding: 'var(--space-6)' }}>
          {requestedGroupId && !groupContextReady && <div role={loadingGroups ? "status" : "alert"} data-testid="event-group-context" className="py-3 space-y-2">
          <Text as="p" variant="body">{t(loadingGroups ? "create.groupContextChecking" : "create.groupContextDenied")}</Text>
          {!loadingGroups && <>
            {groups.length > 0 && <DropdownSelect label={t("create.groupContextAlternative")} value="" onChange={groupId => {
              if (!groups.some(group => group.id === groupId)) return;
              setRecoveredGroupContext(groupContext); patch({ groupId, createNewGroup: false });
            }} placeholder={t("create.groupContextAlternative")} options={groups.map(group => ({ value: group.id, label: group.name }))} />}
            <Button variant="secondary" onClick={recoverPublicCreate}>{t("create.groupContextPublic")}</Button>
          </>}
        </div>}
        <div className="event-create-stepper"><StepBar
            step={step}
            setStep={(n) => {
              if (n <= maxVisitedStep) setStep(n);
            }}
            maxStep={maxVisitedStep}
            stepKeys={STEP_KEYS}
          /></div>

          {step === 0 && (
            <div>
              <Field label={t("field.eventName")} required hint={t("hint.eventName")}>
                <Input
                  type="text"
                  value={data.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder={t("create.ph.name")}
                  maxLength={40}
                  style={fieldStyle}
                />
              </Field>

              <Field label={t("field.eventType")} required>
                <div className="event-create-picker"><SegmentedPicker options={TYPE_OPTIONS} value={data.type} onChange={(v) => patch({ type: v })} columns={4} /></div>
              </Field>

              <Field label={t("field.visibility")} required>
                <div className="event-create-picker"><SegmentedPicker options={VISIBILITY_OPTIONS} value={data.visibility} onChange={(v) => patch({ visibility: v })} columns={3} /></div>
              </Field>

              <Field
                label={t("field.description")}
                sub={`${data.description.length}/500`}
                hint={t("hint.description")}
              >
                <Textarea
                  value={data.description}
                  onChange={(e) => patch({ description: e.target.value.slice(0, 500) })}
                  placeholder={t("create.ph.description")}
                  style={{ ...fieldStyle, minHeight: 90, resize: "vertical", lineHeight: 1.5 }}
                />
              </Field>

              <div className="event-create-fields-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <Field label={t("field.hostName")} required>
                  <Input
                    type="text"
                    value={data.hostName}
                    onChange={(e) => patch({ hostName: e.target.value })}
                    placeholder={t("create.ph.hostName")}
                    style={fieldStyle}
                  />
                </Field>
                <Field label={t("field.hostPhone")} required>
                  <Input
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
                          gap: "var(--space-3)",
                          padding: 'var(--space-4)',
                          background: "color-mix(in oklch, var(--lime) 6%, var(--bg-2))",
                          border: "1px solid color-mix(in oklch, var(--lime) 30%, var(--line-soft))",
                          borderRadius: "var(--r-md)",
                        }}
                      >
                        <div
                          style={{
                            width: 80,
                            height: 50,
                            borderRadius: "var(--r-sm)",
                            background: "var(--bg-3)",
                            display: "grid",
                            placeItems: "center",
                            flexShrink: 0,
                            fontSize: "var(--fs-lg)",
                            color: "var(--ink-3)",
                          }}
                          aria-hidden="true"
                        >
                          <Map size={ICON_SIZE.lg} aria-hidden="true" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[length:var(--ft-body-size)] font-semibold truncate" style={{ color: "var(--ink-0)", marginBottom: 'var(--space-1)' }}>
                            {c.name}
                          </div>
                          <div className="flex flex-wrap" style={{ gap: "var(--space-3)", fontSize: "var(--ft-body-size)", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
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
                    <div className="flex" style={{ gap: 'var(--space-2)', marginBottom: "var(--space-2)" }}>
                      <Button
                        type="button" variant="secondary" size="sm"
                        style={{ background: "var(--bg-3)", color: "var(--ink-0)" }}
                      >
                        {t("action.myCourses")}
                      </Button>
                      <Button
                        type="button"
                        disabled
                        title={t("create.gpxSoon")} variant="secondary" size="sm"
                      >
                        {t("action.uploadGPX")} · {t("create.comingSoon")}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => navigate("/course/create")} variant="secondary" size="sm"
                      >
                        {t("action.drawRoute")}
                      </Button>
                    </div>
                    {loadingCourses ? (
                      <div className="flex items-center" style={{ gap: 'var(--space-2)', padding: "8px 0", fontSize: "var(--ft-body-size)", color: "var(--ink-3)" }}>
                        <div className="w-4 h-4 border-2 border-[var(--lime)] border-t-transparent rounded-full animate-spin" />
                        {t("message.loadingCourses")}
                      </div>
                    ) : availableCourses.length === 0 ? (
                      <EmptyState
                        icon={<Map size={ICON_SIZE.xl} style={{ marginInline: "auto" }} />}
                        title={t("message.noCourses")}
                        description={t("create.noCourseDesc")}
                        actions={[{ label: `+ ${t("create.createCourse")}`, variant: "primary", href: "/course/create" }]}
                        compact
                      />
                    ) : (
                      <>
                        <Input
                          type="search"
                          value={courseSearch}
                          onChange={(e) => setCourseSearch(e.target.value)}
                          placeholder={t("action.searchCourse")}
                          style={{ ...fieldStyle, marginBottom: 'var(--space-2)' }}
                        />
                        <div
                          className="flex flex-col"
                          style={{
                            gap: "var(--space-1-5)",
                            maxHeight: 260,
                            overflowY: "auto",
                            padding: "var(--space-0-5)",
                          }}
                        >
                          {hasMoreCourses && <Button variant="secondary" disabled={loadingMoreCourses} onClick={loadMoreCourses}>{t("common:button.more")}</Button>}
                          {availableCourses
                            .filter((c) => !data.courseIds.includes(c.id))
                            .filter((c) => {
                              const q = courseSearch.trim().toLowerCase();
                              if (!q) return true;
                              const text = `${c.name} ${c.regions?.join(" ") ?? ""}`.toLowerCase();
                              return text.includes(q);
                            })
                            .map((c) => (
                              <Button
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
                                  borderRadius: "var(--r-sm)",
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
                                    borderRadius: "var(--r-xs)",
                                    flexShrink: 0,
                                  }}
                                  aria-hidden="true"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-[length:var(--ft-body-size)] font-semibold truncate" style={{ color: "var(--ink-0)", marginBottom: "var(--space-0-5)" }}>
                                    {c.name}
                                  </div>
                                  <div className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: "var(--ft-body-size)" }}>
                                    {c.regions && c.regions.length > 0 ? `${c.regions.slice(0, 2).join(", ")} · ` : ""}
                                    {(c.distance / 1000).toFixed(1)} km · ↑{Math.round(c.elevationGain).toLocaleString()} m
                                  </div>
                                </div>
                              </Button>
                            ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Field>

              <div className="event-create-fields-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <Field label={t("field.date")} required>
                  <DateField portal icon={<CalendarDays size={ICON_SIZE.sm} aria-hidden="true" />} value={data.date} onChange={(v) => patch({ date: v })} min={new Date().toISOString().split("T")[0]} placeholder={t("field.date")} />
                </Field>
                <Field label={t("field.startTime")} required>
                  <TimeField portal icon={<Clock3 size={ICON_SIZE.sm} aria-hidden="true" />} value={data.startTime} onChange={(v) => patch({ startTime: v })} placeholder={t("field.startTime")} />
                </Field>
              </div>

              <Field label={t("field.meetLocation")} required hint={t("hint.meetLocation")}>
                <Input
                  type="text"
                  value={data.meetLocation}
                  onChange={(e) => patch({ meetLocation: e.target.value })}
                  placeholder={t("create.ph.meetLocation")}
                  style={fieldStyle}
                />
              </Field>

              <div className="event-create-fields-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <Field label={t("field.meetTime")} sub={t("create.meetTimeHint")}>
                  <TimeField portal icon={<Clock3 size={ICON_SIZE.sm} aria-hidden="true" />} value={data.meetTime} onChange={(v) => patch({ meetTime: v })} placeholder={t("field.meetTime")} />
                </Field>
                <Field label={t("field.expectedDuration")} hint={t("hint.expectedDuration")}>
                  <TimeField portal icon={<Clock3 size={ICON_SIZE.sm} aria-hidden="true" />} duration presets={false} value={data.expectedDuration} onChange={(v) => patch({ expectedDuration: v })} placeholder="HH:MM" />
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
                    style={{ marginTop: 'var(--space-1)', flexShrink: 0, width: 'var(--space-4)', height: 'var(--space-4)' }}
                  />
                  <span className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-1)" }}>
                    {t("create.createGroupPre")}<span style={{ color: "var(--lime)", fontWeight: 600 }}>{t("create.createGroupHi")}</span>{t("create.createGroupPost")}
                  </span>
                </label>
                {!data.createNewGroup && (
                  loadingGroups ? (
                    <div className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-3)" }}>{t("create.loadingGroups")}</div>
                  ) : groups.length > 0 ? (
                    <DropdownSelect label={t("create.hostGroup")} value={data.groupId}
                      onChange={groupId => { setRecoveredGroupContext(groupContext); patch({ groupId }); }}
                      options={[{ value: "", label: t("create.noHostGroup") }, ...groups.map(group => ({ value: group.id, label: `${group.name}${group.memberCount > 0 ? ` (${t("create.members", { count: group.memberCount })})` : ""}` }))]} />
                  ) : (
                    <div className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-3)" }}>{t("create.noLeaderGroups")}</div>
                  )
                )}
              </Field>

              {/* 반복(정기) 일정 — 매주 같은 요일·시간으로 N주치 이벤트를 한 번에 생성 */}
              <Field label={t("create.repeat.title")} sub={t("create.optional")} hint={t("create.repeat.hint")}>
                <label className="flex items-center" style={{ gap: 'var(--space-2)', marginBottom: data.repeatEnabled ? 'var(--space-2)' : 0, cursor: "pointer" }}>
                  <Toggle on={data.repeatEnabled} onChange={(v) => patch({ repeatEnabled: v })} />
                  <span className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-1)" }}>{t("create.repeat.enable")}</span>
                </label>
                {data.repeatEnabled && (
                  <div>
                    <div className="event-create-repeat-options flex" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-1-5)' }}>
                      {REPEAT_WEEK_OPTIONS.map((weeks) => (
                        <Button
                          key={weeks}
                          type="button"
                          onClick={() => patch({ repeatWeeks: weeks })}
                          aria-pressed={data.repeatWeeks === weeks}
                          style={{
                            padding: "8px 14px",
                            fontSize: "var(--ft-body-size)",
                            borderRadius: "var(--r-sm)",
                            background: data.repeatWeeks === weeks ? "color-mix(in oklch, var(--lime) 8%, var(--bg-2))" : "var(--bg-2)",
                            border: `1px solid ${data.repeatWeeks === weeks ? "var(--lime)" : "var(--line-soft)"}`,
                            color: data.repeatWeeks === weeks ? "var(--ink-0)" : "var(--ink-2)",
                            cursor: "pointer",
                          }}
                        >
                          {t("create.repeat.weeksOption", { count: weeks })}
                        </Button>
                      ))}
                    </div>
                    <div className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-3)" }}>
                      {t("create.repeat.summaryHint", { count: data.repeatWeeks })}
                    </div>
                  </div>
                )}
              </Field>
            </div>
          )}

          {step === 2 && (
            <div>
              <Field label={t("field.fee")} required>
                <div className="flex flex-wrap items-center" style={{ gap: "var(--space-2)" }}>
                  <Button
                    type="button"
                    onClick={() => patch({ feeType: "FREE", fee: 0 })}
                    aria-pressed={data.feeType === "FREE"}
                    style={{
                      padding: "12px 18px",
                      fontSize: "var(--ft-body-size)",
                      borderRadius: "var(--r-sm)",
                      background: data.feeType === "FREE" ? "color-mix(in oklch, var(--lime) 8%, var(--bg-2))" : "var(--bg-2)",
                      border: `1px solid ${data.feeType === "FREE" ? "var(--lime)" : "var(--line-soft)"}`,
                      color: data.feeType === "FREE" ? "var(--ink-0)" : "var(--ink-2)",
                      cursor: "pointer",
                    }}
                  >
                    {t("feeType.free")}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => patch({ feeType: "PAID" })}
                    aria-pressed={data.feeType === "PAID"}
                    style={{
                      padding: "12px 18px",
                      fontSize: "var(--ft-body-size)",
                      borderRadius: "var(--r-sm)",
                      background: data.feeType === "PAID" ? "color-mix(in oklch, var(--lime) 8%, var(--bg-2))" : "var(--bg-2)",
                      border: `1px solid ${data.feeType === "PAID" ? "var(--lime)" : "var(--line-soft)"}`,
                      color: data.feeType === "PAID" ? "var(--ink-0)" : "var(--ink-2)",
                      cursor: "pointer",
                    }}
                  >
                    {t("feeType.paid")}
                  </Button>
                  {data.feeType === "PAID" && (
                    <div className="event-create-fee-amount flex items-center" style={{ gap: 'var(--space-2)', flex: 1 }}>
                      <Input
                        type="number"
                        aria-label={`${t("label.entryFee")} (${t("create.feeUnit")})`}
                        value={data.fee}
                        onChange={(e) => patch({ fee: Number(e.target.value) || 0 })}
                        placeholder={t("create.ph.fee")}
                        style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                      />
                      <span style={{ fontSize: "var(--ft-body-size)", color: "var(--ink-3)" }}>{t("create.feeUnit")}</span>
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
                      className="event-create-category"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 100px 1fr 32px",
                        gap: 'var(--space-2)',
                        alignItems: "end",
                        padding: "var(--space-2)",
                        background: "var(--bg-2)",
                        border: "1px solid var(--line-soft)",
                        borderRadius: "var(--r-sm)",
                      }}
                    >
                      <div className="event-create-category-field">
                        <label htmlFor={`category-${c.id}-name`}>{t("create.categoryName")}</label>
                        <Input
                          id={`category-${c.id}-name`}
                          type="text"
                          value={c.label}
                          onChange={(e) => updateCategory(c.id, { label: e.target.value })}
                          placeholder={t("create.ph.category")}
                          style={fieldStyle}
                        />
                      </div>
                      <div className="event-create-category-field">
                        <label htmlFor={`category-${c.id}-capacity`}>{t("create.categoryCapacity")}</label>
                        <Input
                          id={`category-${c.id}-capacity`}
                          type="number"
                          value={c.slots}
                          onChange={(e) => updateCategory(c.id, { slots: Number(e.target.value) || 0 })}
                          placeholder={t("create.ph.slots")}
                          style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                        />
                      </div>
                      <div className="event-create-category-field">
                        <label htmlFor={`category-${c.id}-requirements`}>{t("create.categoryRequirements")}</label>
                        <Input
                          id={`category-${c.id}-requirements`}
                          type="text"
                          value={c.req}
                          onChange={(e) => updateCategory(c.id, { req: e.target.value })}
                          placeholder={t("create.ph.req")}
                          style={fieldStyle}
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={() => removeCategory(c.id)}
                        disabled={data.categories.length <= 1}
                        aria-label={t("message.removeCategory")}
                        style={{
                          width: 32,
                          height: 34,
                          borderRadius: "var(--r-sm)",
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
                      </Button>
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
                <div className="flex justify-between" style={{ marginTop: 'var(--space-2)', fontSize: "var(--ft-body-size)", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
                  <span>{t("create.totalSlots", { count: totalSlots })}</span>
                  <span>{t("create.categoryCount", { count: data.categories.length })}</span>
                </div>
              </Field>

              {(() => {
                const open = splitDtLocal(data.openAt);
                const close = splitDtLocal(data.closeAt);
                return (
                  <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
                    <Field label={t("field.openAt")} required>
                      <div className="event-create-fields-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 'var(--space-2)' }}>
                        <DateField portal icon={<CalendarDays size={ICON_SIZE.sm} aria-hidden="true" />}
                          value={open.date}
                          onChange={(v) => patch({ openAt: joinDtLocal(v, open.time) })}
                          placeholder={t("create.openDate")}
                        />
                        <TimeField portal icon={<Clock3 size={ICON_SIZE.sm} aria-hidden="true" />}
                          value={open.time}
                          onChange={(v) => patch({ openAt: joinDtLocal(open.date, v) })}
                          placeholder={t("create.timePh")}
                        />
                      </div>
                    </Field>
                    <Field label={t("field.closeAt")} required>
                      <div className="event-create-fields-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 'var(--space-2)' }}>
                        <DateField portal icon={<CalendarDays size={ICON_SIZE.sm} aria-hidden="true" />}
                          value={close.date}
                          onChange={(v) => patch({ closeAt: joinDtLocal(v, close.time) })}
                          min={open.date || undefined}
                          placeholder={t("create.closeDate")}
                        />
                        <TimeField portal icon={<Clock3 size={ICON_SIZE.sm} aria-hidden="true" />}
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
                <div className="flex flex-wrap items-center" style={{ gap: "var(--space-2)" }}>
                  <Button
                    type="button"
                    onClick={() => patch({ cutoffEnabled: !data.cutoffEnabled })}
                    aria-pressed={data.cutoffEnabled}
                    style={{
                      padding: "8px 14px",
                      fontSize: "var(--ft-body-size)",
                      borderRadius: "var(--r-sm)",
                      background: data.cutoffEnabled ? "color-mix(in oklch, var(--lime) 8%, var(--bg-2))" : "var(--bg-2)",
                      border: `1px solid ${data.cutoffEnabled ? "var(--lime)" : "var(--line-soft)"}`,
                      color: data.cutoffEnabled ? "var(--ink-0)" : "var(--ink-2)",
                      cursor: "pointer",
                    }}
                  >
                    {data.cutoffEnabled ? t("create.cutoffOn") : t("create.cutoffOff")}
                  </Button>
                  {data.cutoffEnabled && (
                    <span style={{ fontSize: "var(--ft-body-size)", color: "var(--ink-3)" }}>
                      {t("create.cutoffBufferPre")}
                      <Input
                        type="number"
                        aria-label={`${t("edit.cutoffBuffer")} (${t("edit.cutoffMin")})`}
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
                        marginBottom: "var(--space-1-5)",
                        background: "var(--bg-2)",
                        border: "1px solid var(--line-soft)",
                        borderRadius: "var(--r-sm)",
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
                          borderRadius: "var(--r-xl)",
                          position: "relative",
                          flexShrink: 0,
                          marginTop: "var(--space-0-5)",
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
                        <div className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-0)", marginBottom: "var(--space-0-5)" }}><GlossaryText>{opt.label}</GlossaryText></div>
                        <div className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-3)" }}><GlossaryText>{opt.desc}</GlossaryText></div>
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
                borderRadius: "var(--r-sm)",
              }}
            >
              <p className="text-[length:var(--ft-body-size)]" style={{ color: "var(--rose)", margin: 0 }}>{submitError}</p>
            </div>
          )}

          {/* Navigation */}
          <div
            className="event-create-navigation flex items-center justify-between"
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
          style={{ padding: "var(--space-4)", position: "sticky", top: 68 }}
        >
          <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-2)" }}>{t("preview")}</Text>
          <div style={{ fontSize: "var(--ft-body-size)", fontWeight: 600, color: "var(--ink-0)", marginBottom: 'var(--space-1)', minHeight: 20 }}>
            {data.name || <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>{t("create.ph.eventName")}</span>}
          </div>
          <div style={{ fontSize: "var(--ft-body-size)", color: "var(--ink-3)", fontFamily: "var(--font-mono)", marginBottom: "var(--space-3)" }}>
            {data.date ? `${data.date} ${data.startTime || ""}` : t("create.dateTbd")}
          </div>

          <dl
            className="flex flex-col"
            style={{
              gap: 'var(--space-2)',
              fontSize: "var(--ft-body-size)",
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
              [t("create.sum.fee"), data.feeType === "FREE" ? t("feeType.free") : data.fee ? `₩ ${Number(data.fee).toLocaleString(localeTag())}` : "–"],
            ].map(([k, v], index) => (
              <div key={k} className="flex justify-between" style={{ gap: "var(--space-2)" }}>
                <dt style={{ color: "var(--ink-3)" }}>{k}</dt>
                <dd style={{ color: "var(--ink-1)", fontFamily: [3, 4, 5, 6].includes(index) || (index === 7 && data.feeType === "PAID") ? "var(--font-mono)" : "inherit", textAlign: "right", margin: 0 }}>{v}</dd>
              </div>
            ))}
          </dl>

          <div
            style={{
              marginTop: "var(--space-4)",
              paddingTop: 14,
              borderTop: "1px solid var(--line-soft)",
              fontSize: "var(--ft-body-size)",
              color: "var(--ink-3)",
              lineHeight: 1.5,
            }}
          >
            {t("create.previewFooter")}
          </div>
        </Card>
      </div>

      <style>{`
        .event-create-surface .event-create-body > * { min-width: 0; max-width: 100%; }
        .event-create-surface .event-create-category-field { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
        .event-create-surface .event-create-category-field label { font-size: var(--ft-body-size); color: var(--ink-2); }
        .event-create-surface :is(input, textarea, select) { min-width: 0; max-width: 100%; }
        @media (max-width: 1024px) {
          .event-create-body { grid-template-columns: minmax(0, 1fr) !important; }
          .event-create-aside { position: static !important; }
        }
        @media (max-width: 36rem) {
          .event-create-surface .event-create-main { padding: var(--space-4) !important; }
          .event-create-surface .event-create-stepper > div { flex-direction: column; gap: var(--space-2) !important; }
          .event-create-surface .event-create-stepper > div > div { flex: none !important; min-width: 0; }
          .event-create-surface .event-create-stepper > div > div > div { display: none; }
          .event-create-surface .event-create-stepper span { overflow-wrap: anywhere; }
          .event-create-surface .event-create-picker { --event-picker-column-count: 2; }
          .event-create-surface .event-create-picker button { min-width: 0; word-break: keep-all; overflow-wrap: normal; }
          .event-create-surface .event-create-fields-grid, .event-create-surface .event-create-category { grid-template-columns: minmax(0, 1fr) !important; }
          .event-create-surface .event-create-category > button { justify-self: end; }
          .event-create-surface .event-create-fee-amount { flex: 1 1 100% !important; min-width: 0; }
          .event-create-surface .event-create-fee-amount input { flex: 1; }
          .event-create-surface .event-create-fee-amount span { flex-shrink: 0; white-space: nowrap; }
          .event-create-surface .event-create-repeat-options, .event-create-surface .event-create-navigation { flex-wrap: wrap; }
          .event-create-surface .event-create-navigation .ds-btn { max-width: 100%; }
          .event-create-surface .event-create-aside dd { min-width: 0; overflow-wrap: anywhere; }
        }
        @media (max-width: 24rem) {
          .event-create-surface .event-create-picker { --event-picker-column-count: 1; }
        }
      `}</style>
    </div>
    </GlossaryProvider>
  );
}
