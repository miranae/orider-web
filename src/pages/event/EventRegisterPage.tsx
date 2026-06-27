import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { EmptyState, ErrorState, LoadingSkeleton, PermissionGate, DateField } from "../../components/redesign";
import { fmtIsoLocal, isClosed, normalizeStartTime } from "../../utils/event-time";
import { Button, Card, Chip, Text } from "../../theme/components";

interface EventCategory {
  id: string;
  name?: string;
  label?: string;
  desc?: string;
  req?: string;
  slots?: number;
  capacity?: number;
}

interface EventSummary {
  id: string;
  name: string;
  type: string;
  status: string;
  startTime: number;
  closeAt?: string;
  fee?: number;
  feeType?: string;
  categories: EventCategory[];
  maxParticipants?: number;
  distance?: number;
  insuranceFee?: number;
}

const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2XL"] as const;
type ShirtSize = (typeof SHIRT_SIZES)[number] | "";

type Gender = "M" | "F" | "X" | "";
/** 표준 4형(A/B/O/AB) × Rh(+/-) 조합 또는 자유 입력 (Rh-Null·Bombay 등 특이 혈액형) */
type BloodType = string;
const ABO_TYPES = ["A", "B", "O", "AB"] as const;
type Abo = (typeof ABO_TYPES)[number];

interface BloodComponents {
  abo: Abo | "";
  rh: "+" | "-" | "";
  custom: string;
}

function parseBloodType(v: string): BloodComponents {
  const t = v.trim();
  if (!t) return { abo: "", rh: "", custom: "" };
  const m = t.match(/^(AB|A|B|O)([+-])?$/);
  if (m) return { abo: m[1] as Abo, rh: (m[2] as "+" | "-" | undefined) ?? "", custom: "" };
  return { abo: "", rh: "", custom: t };
}

function composeBloodType(c: BloodComponents): string {
  if (c.custom.trim()) return c.custom.trim().slice(0, 32);
  if (!c.abo) return "";
  return `${c.abo}${c.rh}`;
}

interface FormData {
  categoryId: string;
  name: string;
  birth: string;
  gender: Gender;
  bloodType: BloodType;
  phone: string;
  shirtSize: ShirtSize;
  emName: string;
  emRel: string;
  emPhone: string;
  medical: string;
  agreements: {
    terms: boolean;
    privacy: boolean;
    liability: boolean;
    marketing: boolean;
  };
  payMethod: "card" | "bank" | "toss" | "kakao";
}

interface StepInfo {
  key: "category" | "profile" | "terms" | "payment";
  label: string;
}

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
  children,
}: {
  label: string;
  required?: boolean;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <label className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-1)" }}>{label}</span>
        {required && <span style={{ color: "var(--rose)", fontSize: 11 }}>*</span>}
        {sub && <span style={{ fontSize: 10, color: "var(--ink-3)", marginLeft: "auto" }}>{sub}</span>}
      </label>
      {children}
    </div>
  );
}

function StepBar({ steps, stepIdx }: { steps: StepInfo[]; stepIdx: number }) {
  return (
    <div className="flex" style={{ gap: 0, marginBottom: 28 }}>
      {steps.map((s, i) => {
        const done = stepIdx > i;
        const cur = stepIdx === i;
        return (
          <div key={s.key} className="flex items-center" style={{ gap: 10, flex: 1 }}>
            <div
              aria-current={cur ? "step" : undefined}
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: cur
                  ? "var(--lime)"
                  : done
                  ? "color-mix(in oklch, var(--lime) 20%, var(--bg-2))"
                  : "var(--bg-2)",
                color: cur ? "var(--primary-fg)" : done ? "var(--lime)" : "var(--ink-3)",
                display: "grid",
                placeItems: "center",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                border: !cur && !done ? "1px solid var(--line-soft)" : "none",
                flexShrink: 0,
              }}
            >
              {done ? "✓" : i + 1}
            </div>
            <span
              style={{
                fontSize: 12,
                color: cur ? "var(--ink-0)" : "var(--ink-3)",
                fontWeight: cur ? 500 : 400,
              }}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: done
                    ? "color-mix(in oklch, var(--lime) 30%, transparent)"
                    : "var(--line-soft)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function fmtDateTime(ts: number) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function EventRegisterPage() {
  const { t } = useTranslation("event");
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [event, setEvent] = useState<EventSummary | null>(null);
  const [filledByCategory, setFilledByCategory] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [registrationNumber, setRegistrationNumber] = useState<string | null>(null);

  const [data, setData] = useState<FormData>({
    categoryId: "",
    name: "",
    birth: "",
    gender: "",
    bloodType: "",
    phone: "",
    shirtSize: "M",
    emName: "",
    emRel: "",
    emPhone: "",
    medical: "",
    agreements: { terms: false, privacy: false, liability: false, marketing: false },
    payMethod: "card",
  });

  // 약관 항목 — 번역된 레이블과 미리보기 텍스트
  const TERM_ITEMS = useMemo(() => [
    {
      id: "terms" as const,
      label: t("register.terms.termsLabel"),
      required: true,
      preview: t("register.terms.termsPreview"),
    },
    {
      id: "privacy" as const,
      label: t("register.terms.privacyLabel"),
      required: true,
      preview: t("register.terms.privacyPreview"),
    },
    {
      id: "liability" as const,
      label: t("register.terms.liabilityLabel"),
      required: true,
      preview: t("register.terms.liabilityPreview"),
    },
    {
      id: "marketing" as const,
      label: t("register.terms.marketingLabel"),
      required: false,
      preview: t("register.terms.marketingPreview"),
    },
  ] as const, [t]);

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
      const register = d.register || {};
      const categoriesRaw: EventCategory[] = Array.isArray(info.categories) && info.categories.length > 0
        ? info.categories
        : Array.isArray(register.categories) ? register.categories : [];
      setEvent({
        id: snap.id,
        name: info.name || t("noName"),
        type: info.type || "TOUR",
        status: info.status || "UNKNOWN",
        startTime: normalizeStartTime(info.startTime),
        closeAt: info.closeAt || undefined,
        fee: typeof info.entryFee === "number" ? info.entryFee : register.fee,
        feeType: info.feeType || register.feeType,
        categories: categoriesRaw,
        maxParticipants: info.settings?.maxParticipants || info.maxParticipants || 0,
        distance: typeof info.distance === "number" ? info.distance : undefined,
        insuranceFee: typeof info.insuranceFee === "number" ? info.insuranceFee : undefined,
      });

      // 카테고리별 신청 수 집계
      try {
        const partsSnap = await getDocs(collection(firestore, `events/${eventId}/participants`));
        const counts: Record<string, number> = {};
        partsSnap.forEach((p) => {
          const cat = (p.data() as { category?: string }).category;
          if (cat) counts[cat] = (counts[cat] ?? 0) + 1;
        });
        setFilledByCategory(counts);
      } catch (err) {
        console.warn("카테고리 신청 수 조회 실패:", err);
      }
    } catch (err) {
      console.error("이벤트 조회 실패:", err);
      setLoadError(err instanceof Error ? err.message : t("register.errLoad"));
    } finally {
      setLoading(false);
    }
  }, [eventId, t]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  // 동적 step 목록 — 카테고리 없으면 1단계 스킵, 무료면 결제 스킵
  const steps = useMemo<StepInfo[]>(() => {
    const out: StepInfo[] = [];
    if ((event?.categories?.length ?? 0) > 0) out.push({ key: "category", label: t("label.categories") });
    out.push({ key: "profile", label: t("register.step.profile") });
    out.push({ key: "terms", label: t("register.step.terms") });
    if ((event?.fee ?? 0) > 0 && event?.feeType !== "FREE") out.push({ key: "payment", label: t("register.step.payment") });
    return out;
  }, [event, t]);

  const currentStep = steps[Math.min(stepIdx, steps.length - 1)] ?? steps[0];

  const canAdvance = useMemo(() => {
    if (!currentStep) return false;
    switch (currentStep.key) {
      case "category":
        return !!data.categoryId;
      case "profile":
        return data.name.trim().length > 0 && !!data.birth && !!data.gender && data.phone.trim().length > 0 && data.emPhone.trim().length > 0;
      case "terms":
        return data.agreements.terms && data.agreements.privacy && data.agreements.liability;
      case "payment":
        // 결제 게이트웨이 미연동 — 결제 수단 선택만 검증
        return !!data.payMethod;
    }
  }, [currentStep, data]);

  const isLastStep = stepIdx === steps.length - 1;
  // 보험료 — 이벤트가 별도 책정 시 info.insuranceFee, 없으면 기본 5,000원 (그란폰도 통상값)
  const insurance = event?.insuranceFee ?? 5000;
  const totalAmount = (event?.fee ?? 0) + insurance;

  const handleSubmit = async () => {
    if (!eventId || !user || submitting) return;
    setSubmitting(true);
    try {
      const join = httpsCallable<unknown, { eventId: string; isNew: boolean; registrationNumber?: string }>(
        functions,
        "joinOrCreateEvent"
      );
      const result = await join({
        eventId,
        categoryId: data.categoryId || undefined,
        profile: {
          name: data.name.trim() || undefined,
          birth: data.birth || undefined,
          gender: data.gender || undefined,
          phone: data.phone.trim() || undefined,
          shirtSize: data.shirtSize || undefined,
          medical: data.medical.trim() || undefined,
          bloodType: data.bloodType.trim() || undefined,
        },
        emergencyContact: {
          name: data.emName.trim() || undefined,
          relation: data.emRel.trim() || undefined,
          phone: data.emPhone.trim() || undefined,
        },
        agreements: data.agreements,
        ...(steps.find((s) => s.key === "payment")
          ? { payment: { method: data.payMethod, amount: totalAmount } }
          : {}),
      });
      setRegistrationNumber(result.data.registrationNumber ?? null);
    } catch (err: unknown) {
      console.error("참가 신청 실패:", err);
      const fbErr = err as { code?: string; message?: string };
      const msg = fbErr?.code === "functions/already-exists"
        ? t("register.errAlreadyRegistered")
        : fbErr?.code === "functions/resource-exhausted"
          ? t("register.errFull")
          : fbErr?.code === "functions/failed-precondition"
            ? t("register.errNotOpen")
            : fbErr?.message || t("register.errSubmit");
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (stepIdx < steps.length - 1) {
      setStepIdx(stepIdx + 1);
    } else {
      void handleSubmit();
    }
  };

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
        <ErrorState title={t("register.errLoadTitle")} description={loadError} onRetry={loadEvent} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <PermissionGate title={t("register.loginRequired")} description={t("register.loginDesc")} />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon="🗓️"
          title={t("empty.noResults")}
          actions={[{ label: t("register.goEventList"), variant: "primary", onClick: () => navigate("/events") }]}
        />
      </div>
    );
  }

  if (event.status !== "OPEN") {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon="⏱️"
          title={t("register.notOpen")}
          description={
            event.status === "LIVE"
              ? t("register.statusLiveDesc")
              : event.status === "DRAFT"
                ? t("register.statusDraftDesc")
                : t("register.statusClosedDesc")
          }
          actions={[{ label: t("register.goEventDetail"), variant: "primary", onClick: () => navigate(`/event/${eventId}`) }]}
        />
      </div>
    );
  }

  if (isClosed(event.closeAt)) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon="⏱️"
          title={t("register.closed")}
          description={t("register.closedDesc", { dateTime: fmtIsoLocal(event.closeAt) })}
          actions={[{ label: t("register.goEventDetail"), variant: "primary", onClick: () => navigate(`/event/${eventId}`) }]}
        />
      </div>
    );
  }

  // 완료 화면
  if (registrationNumber !== null) {
    const cat = event.categories.find((c) => c.id === data.categoryId);
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
          {t("message.registrationComplete")}
        </h1>
        <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 28 }}>
          {(event.fee ?? 0) > 0
            ? t("register.donePaymentDesc")
            : t("register.doneConfirmDesc")}
          <br />
          {t("register.doneBibNotice")}
        </div>
        <Card padding="none" style={{ padding: 'var(--space-5)', textAlign: "left", marginBottom: 'var(--space-5)' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-2)', fontSize: 12 }}>
            <span style={{ color: "var(--ink-3)" }}>{t("label.registration")}</span>
            <span style={{ color: "var(--ink-0)", fontFamily: "var(--font-mono)" }}>{registrationNumber || "—"}</span>
          </div>
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-2)', fontSize: 12 }}>
            <span style={{ color: "var(--ink-3)" }}>{t("register.summaryEvent")}</span>
            <span style={{ color: "var(--ink-0)" }}>{event.name}</span>
          </div>
          {cat && (
            <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-2)', fontSize: 12 }}>
              <span style={{ color: "var(--ink-3)" }}>{t("label.categories")}</span>
              <span style={{ color: "var(--ink-0)" }}>{cat.name ?? cat.label ?? "-"}</span>
            </div>
          )}
          <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
            <span style={{ color: "var(--ink-3)" }}>{(event.fee ?? 0) > 0 ? t("register.paymentAmount") : t("label.entryFee")}</span>
            <span style={{ color: "var(--lime)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              {(event.fee ?? 0) > 0 ? `₩ ${totalAmount.toLocaleString("ko-KR")}` : t("feeType.free")}
            </span>
          </div>
        </Card>
        <div className="flex justify-center" style={{ gap: 10 }}>
          <Button type="button" onClick={() => navigate(`/event/${eventId}`)} variant="primary">
            {t("register.goEventDetail")}
          </Button>
          <Button type="button" onClick={() => navigate("/events")} variant="secondary">
            {t("register.goEventList")}
          </Button>
        </div>
      </div>
    );
  }

  const selectedCat = event.categories.find((c) => c.id === data.categoryId);

  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "var(--space-5) var(--space-6)" }}>
      {/* Breadcrumb */}
      <div className="flex items-center" style={{ gap: 'var(--space-2)', fontSize: 11, color: "var(--ink-3)", marginBottom: 'var(--space-4)' }}>
        <Link to="/events" style={{ color: "var(--ink-3)" }}>{t("title")}</Link>
        <span style={{ color: "var(--ink-4)" }}>›</span>
        <Link to={`/event/${eventId}`} style={{ color: "var(--ink-3)" }} className="truncate">
          {event.name}
        </Link>
        <span style={{ color: "var(--ink-4)" }}>›</span>
        <span style={{ color: "var(--ink-2)" }}>{t("registerTitle")}</span>
      </div>

      <h1 style={{ fontSize: 24, letterSpacing: "-0.02em", marginBottom: 'var(--space-1)', color: "var(--ink-0)" }}>{t("registerTitle")}</h1>
      <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 'var(--space-6)' }}>
        {event.name}
        {event.closeAt ? ` · ${t("register.closingLabel")} ${fmtIsoLocal(event.closeAt)}` : ""}
      </div>

      <div
        className="event-register-body"
        style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 'var(--space-6)', alignItems: "flex-start" }}
      >
        <Card padding="none" style={{ padding: 'var(--space-6)' }}>
          <StepBar steps={steps} stepIdx={stepIdx} />

          {currentStep?.key === "category" && (
            <div role="radiogroup" aria-label={t("message.selectCategory")} className="flex flex-col" style={{ gap: 10 }}>
              {event.categories.map((c) => {
                const slots = c.slots ?? c.capacity ?? 0;
                const filled = filledByCategory[c.id] ?? 0;
                const pct = slots > 0 ? Math.min(100, Math.round((filled / slots) * 100)) : 0;
                const full = slots > 0 && filled >= slots;
                const active = data.categoryId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => !full && setData({ ...data, categoryId: c.id })}
                    disabled={full}
                    style={{
                      padding: "16px 18px",
                      textAlign: "left",
                      borderRadius: 6,
                      background: active ? "color-mix(in oklch, var(--lime) 8%, var(--bg-2))" : "var(--bg-2)",
                      border: `1px solid ${active ? "var(--lime)" : "var(--line-soft)"}`,
                      opacity: full ? 0.5 : 1,
                      cursor: full ? "not-allowed" : "pointer",
                    }}
                  >
                    <div className="flex items-start" style={{ gap: 'var(--space-4)' }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center" style={{ gap: 'var(--space-2)', marginBottom: 6 }}>
                          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-0)" }}>
                            {c.name ?? c.label ?? c.id}
                          </span>
                          {full && (
                            <Chip
                              style={{
                                fontSize: 9,
                                color: "var(--rose)",
                                borderColor: "color-mix(in oklch, var(--rose) 40%, transparent)",
                              }}
                            >
                              {t("register.full")}
                            </Chip>
                          )}
                        </div>
                        {c.desc && (
                          <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", marginBottom: 'var(--space-2)' }}>{c.desc}</div>
                        )}
                        {c.req && (
                          <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
                            {t("register.reqPrefix")} · {c.req}
                          </div>
                        )}
                      </div>
                      {slots > 0 && (
                        <div style={{ width: 140 }}>
                          <div className="flex justify-between" style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-3)", marginBottom: 'var(--space-1)' }}>
                            <span>{filled}/{slots}</span>
                            <span>{pct}%</span>
                          </div>
                          <div style={{ height: 3, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
                            <div
                              style={{
                                width: `${pct}%`,
                                height: "100%",
                                background: pct > 85 ? "var(--amber)" : "var(--lime)",
                              }}
                            />
                          </div>
                          <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 'var(--space-1)', textAlign: "right" }}>
                            {t("register.remaining", { count: Math.max(0, slots - filled) })}
                          </div>
                        </div>
                      )}
                      {active && (
                        <span aria-hidden="true" style={{ color: "var(--lime)", marginTop: 2, fontSize: 18 }}>
                          ✓
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {currentStep?.key === "profile" && (
            <div>
              <div
                className="flex"
                style={{
                  padding: "12px 14px",
                  background: "color-mix(in oklch, var(--aqua) 6%, var(--bg-2))",
                  border: "1px solid color-mix(in oklch, var(--aqua) 30%, var(--line-soft))",
                  borderRadius: 5,
                  marginBottom: 'var(--space-5)',
                  gap: 10,
                  fontSize: 12,
                  color: "var(--ink-1)",
                }}
              >
                <span aria-hidden="true" style={{ color: "var(--aqua)", flexShrink: 0, marginTop: 2 }}>⚠</span>
                <div>
                  {t("register.profileNotice")}
                </div>
              </div>

              <dl className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-2)", display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 6, columnGap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                <dt style={{ color: "var(--ink-3)" }}>{t("register.labelNickname")}</dt>
                <dd style={{ color: "var(--ink-0)" }}>{profile?.nickname ?? user.displayName ?? "-"}</dd>
                <dt style={{ color: "var(--ink-3)" }}>{t("register.labelEmail")}</dt>
                <dd style={{ color: "var(--ink-0)" }}>{user.email ?? "-"}</dd>
              </dl>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label={t("register.fieldName")} required>
                  <input
                    type="text"
                    value={data.name}
                    onChange={(e) => setData({ ...data, name: e.target.value })}
                    placeholder={t("register.phName")}
                    style={fieldStyle}
                  />
                </Field>
                <Field label={t("register.fieldBirth")} required>
                  <DateField
                    value={data.birth}
                    onChange={(v) => setData({ ...data, birth: v })}
                    max={new Date().toISOString().split("T")[0]}
                    placeholder={t("register.phBirth")}
                  />
                </Field>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label={t("register.fieldGender")} required>
                  <div className="flex" style={{ gap: 6 }}>
                    {([["M", t("register.genderM")], ["F", t("register.genderF")], ["X", t("register.genderX")]] as Array<[Gender, string]>).map(([v, l]) => {
                      const active = data.gender === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setData({ ...data, gender: v })}
                          aria-pressed={active}
                          style={{
                            flex: 1,
                            padding: "9px 10px",
                            fontSize: 12,
                            borderRadius: 5,
                            background: active ? "var(--bg-3)" : "var(--bg-2)",
                            color: active ? "var(--ink-0)" : "var(--ink-3)",
                            border: `1px solid ${active ? "var(--ink-3)" : "var(--line-soft)"}`,
                            cursor: "pointer",
                          }}
                        >
                          {l}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Field label={t("register.fieldPhone")} required>
                  <input
                    type="tel"
                    value={data.phone}
                    onChange={(e) => setData({ ...data, phone: e.target.value })}
                    placeholder="010-0000-0000"
                    style={fieldStyle}
                  />
                </Field>
              </div>

              <Field label={t("register.fieldBloodType")} sub={t("register.bloodTypeSub")}>
                {(() => {
                  const parts = parseBloodType(data.bloodType);
                  const isCustom = !!parts.custom;
                  const setParts = (next: BloodComponents) =>
                    setData({ ...data, bloodType: composeBloodType(next) });
                  return (
                    <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
                      {/* ABO 4형 */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                        {ABO_TYPES.map((abo) => {
                          const active = parts.abo === abo;
                          return (
                            <button
                              key={abo}
                              type="button"
                              onClick={() => setParts({ abo: active ? "" : abo, rh: active ? "" : parts.rh, custom: "" })}
                              aria-pressed={active}
                              disabled={isCustom}
                              style={{
                                padding: "9px 10px",
                                fontSize: 12,
                                borderRadius: 5,
                                fontFamily: "var(--font-mono)",
                                background: active ? "var(--bg-3)" : "var(--bg-2)",
                                color: active ? "var(--ink-0)" : "var(--ink-3)",
                                border: `1px solid ${active ? "var(--ink-3)" : "var(--line-soft)"}`,
                                cursor: isCustom ? "not-allowed" : "pointer",
                                opacity: isCustom ? 0.4 : 1,
                              }}
                            >
                              {abo}
                            </button>
                          );
                        })}
                      </div>
                      {/* Rh +/- (ABO 선택 후만 활성) */}
                      <div className="flex items-center" style={{ gap: 6 }}>
                        <span style={{ fontSize: 11, color: "var(--ink-3)", minWidth: 28 }}>Rh</span>
                        {(["+", "-"] as const).map((rh) => {
                          const active = parts.rh === rh;
                          const enabled = !!parts.abo && !isCustom;
                          return (
                            <button
                              key={rh}
                              type="button"
                              onClick={() => enabled && setParts({ ...parts, rh: active ? "" : rh })}
                              aria-pressed={active}
                              disabled={!enabled}
                              style={{
                                padding: "7px 18px",
                                fontSize: 12,
                                borderRadius: 5,
                                fontFamily: "var(--font-mono)",
                                background: active ? "var(--bg-3)" : "var(--bg-2)",
                                color: active ? "var(--ink-0)" : "var(--ink-3)",
                                border: `1px solid ${active ? "var(--ink-3)" : "var(--line-soft)"}`,
                                cursor: enabled ? "pointer" : "not-allowed",
                                opacity: enabled ? 1 : 0.4,
                              }}
                            >
                              {rh}
                            </button>
                          );
                        })}
                        {parts.abo && parts.rh && (
                          <span
                            style={{
                              marginLeft: "auto",
                              fontSize: 11,
                              color: "var(--ink-3)",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {t("register.bloodSelected")}: <span style={{ color: "var(--ink-0)" }}>{parts.abo}{parts.rh}</span>
                          </span>
                        )}
                      </div>
                      {/* 특이 혈액형 */}
                      <div className="flex items-center" style={{ gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => setParts({ abo: "", rh: "", custom: isCustom ? "" : (parts.custom || " ") })}
                          aria-pressed={isCustom}
                          style={{
                            padding: "9px 14px",
                            fontSize: 12,
                            borderRadius: 5,
                            background: isCustom ? "var(--bg-3)" : "var(--bg-2)",
                            color: isCustom ? "var(--ink-0)" : "var(--ink-3)",
                            border: `1px solid ${isCustom ? "var(--ink-3)" : "var(--line-soft)"}`,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t("register.bloodRare")}
                        </button>
                        {isCustom && (
                          <input
                            type="text"
                            value={parts.custom.trim()}
                            onChange={(e) => setParts({ abo: "", rh: "", custom: e.target.value.slice(0, 32) })}
                            placeholder={t("register.bloodRarePh")}
                            maxLength={32}
                            style={{ ...fieldStyle, flex: 1 }}
                            autoFocus
                          />
                        )}
                      </div>
                    </div>
                  );
                })()}
              </Field>

              <Field label={t("register.fieldShirtSize")}>
                <div className="flex" style={{ gap: 6 }}>
                  {SHIRT_SIZES.map((s) => {
                    const active = data.shirtSize === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setData({ ...data, shirtSize: active ? "" : s })}
                        aria-pressed={active}
                        style={{
                          flex: 1,
                          padding: "9px 10px",
                          fontSize: 12,
                          borderRadius: 5,
                          fontFamily: "var(--font-mono)",
                          background: active ? "var(--bg-3)" : "var(--bg-2)",
                          color: active ? "var(--ink-0)" : "var(--ink-3)",
                          border: `1px solid ${active ? "var(--ink-3)" : "var(--line-soft)"}`,
                          cursor: "pointer",
                        }}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <div
                style={{
                  padding: "14px 16px",
                  background: "var(--bg-2)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 6,
                  marginTop: 'var(--space-1)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-0)", marginBottom: 10 }}>{t("register.emergencyContact")}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <input
                    type="text"
                    value={data.emName}
                    onChange={(e) => setData({ ...data, emName: e.target.value })}
                    placeholder={t("register.phEmName")}
                    style={fieldStyle}
                  />
                  <input
                    type="text"
                    value={data.emRel}
                    onChange={(e) => setData({ ...data, emRel: e.target.value })}
                    placeholder={t("register.phEmRel")}
                    style={fieldStyle}
                  />
                  <input
                    type="tel"
                    value={data.emPhone}
                    onChange={(e) => setData({ ...data, emPhone: e.target.value })}
                    placeholder={t("register.phEmPhone")}
                    style={fieldStyle}
                  />
                </div>
              </div>

              <Field label={t("register.fieldMedical")} sub={t("register.medicalSub")}>
                <input
                  type="text"
                  value={data.medical}
                  onChange={(e) => setData({ ...data, medical: e.target.value })}
                  placeholder={t("register.phMedical")}
                  style={fieldStyle}
                />
              </Field>
            </div>
          )}

          {currentStep?.key === "terms" && (
            <div className="flex flex-col" style={{ gap: 10 }}>
              {TERM_ITEMS.map((it) => {
                const checked = data.agreements[it.id];
                return (
                  <div
                    key={it.id}
                    style={{
                      padding: "12px 14px",
                      background: "var(--bg-2)",
                      border: "1px solid var(--line-soft)",
                      borderRadius: 6,
                    }}
                  >
                    <label className="flex items-center" style={{ gap: 10, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setData({
                            ...data,
                            agreements: { ...data.agreements, [it.id]: e.target.checked },
                          })
                        }
                        className="sr-only"
                      />
                      <div
                        aria-hidden="true"
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          background: checked ? "var(--lime)" : "var(--bg-3)",
                          border: checked ? "none" : "1px solid var(--line-soft)",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                          color: "var(--primary-fg)",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {checked ? "✓" : ""}
                      </div>
                      <div className="flex-1 flex items-center" style={{ gap: 'var(--space-2)' }}>
                        <span style={{ fontSize: 12, color: "var(--ink-0)", fontWeight: 500 }}>{it.label}</span>
                        <span
                          style={{
                            fontSize: 10,
                            color: it.required ? "var(--rose)" : "var(--ink-3)",
                          }}
                        >
                          ({it.required ? t("register.required") : t("register.optional")})
                        </span>
                      </div>
                      <Button
                        type="button" variant="secondary" size="sm"
                        style={{ padding: "var(--space-1) var(--space-2)", fontSize: 10 }}
                        onClick={(e) => { e.preventDefault(); alert(t("register.fullTextSoon")); }}
                      >
                        {t("register.viewFullText")}
                      </Button>
                    </label>
                    <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5, marginTop: 'var(--space-2)', paddingLeft: 28 }}>
                      {it.preview}
                    </div>
                  </div>
                );
              })}

              {(() => {
                const allOn = TERM_ITEMS.every((i) => data.agreements[i.id]);
                return (
                  <label
                    className="flex items-center"
                    style={{
                      gap: 10,
                      padding: "12px 14px",
                      background: "color-mix(in oklch, var(--lime) 5%, var(--bg-2))",
                      border: "1px solid color-mix(in oklch, var(--lime) 25%, var(--line-soft))",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      const next = { terms: !allOn, privacy: !allOn, liability: !allOn, marketing: !allOn };
                      setData({ ...data, agreements: next });
                    }}
                  >
                    <div
                      aria-hidden="true"
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        background: allOn ? "var(--lime)" : "var(--bg-3)",
                        border: allOn ? "none" : "1px solid var(--line-soft)",
                        display: "grid",
                        placeItems: "center",
                        color: "var(--primary-fg)",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {allOn ? "✓" : ""}
                    </div>
                    <span style={{ fontSize: 12, color: "var(--ink-0)", fontWeight: 500 }}>{t("register.agreeAll")}</span>
                  </label>
                );
              })()}
            </div>
          )}

          {currentStep?.key === "payment" && (
            <div>
              {/* 결제 요약 */}
              <div
                style={{
                  padding: 'var(--space-5)',
                  background: "var(--bg-2)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 6,
                  marginBottom: 'var(--space-4)',
                }}
              >
                <div
                  className="flex items-center justify-between"
                  style={{ paddingBottom: 14, marginBottom: 14, borderBottom: "1px solid var(--line-soft)" }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-0)", marginBottom: 'var(--space-1)' }}>{event.name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      {(selectedCat?.name ?? selectedCat?.label) || "–"} · {data.name || "–"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Text as="div" variant="eyebrow" style={{ fontSize: 9, marginBottom: 2 }}>{t("label.entryFee")}</Text>
                    <Text as="div" variant="dataMedium">₩ {(event.fee ?? 0).toLocaleString("ko-KR")}</Text>
                  </div>
                </div>
                <div className="flex flex-col" style={{ gap: 6, fontSize: 12 }}>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--ink-3)" }}>{t("label.entryFee")}</span>
                    <span style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>
                      ₩ {(event.fee ?? 0).toLocaleString("ko-KR")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--ink-3)" }}>{t("register.insurance")}</span>
                    <span style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>
                      ₩ {insurance.toLocaleString("ko-KR")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--ink-3)" }}>{t("register.paymentFee")}</span>
                    <span style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>₩ 0</span>
                  </div>
                  <div
                    className="flex justify-between"
                    style={{ paddingTop: 10, marginTop: 6, borderTop: "1px solid var(--line-soft)", fontSize: 13 }}
                  >
                    <span style={{ color: "var(--ink-0)", fontWeight: 500 }}>{t("register.totalAmount")}</span>
                    <span style={{ color: "var(--lime)", fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 15 }}>
                      ₩ {totalAmount.toLocaleString("ko-KR")}
                    </span>
                  </div>
                </div>
              </div>

              <Field label={t("register.fieldPayMethod")} required>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 'var(--space-2)' }}>
                  {([
                    { id: "card", label: t("register.payCard") },
                    { id: "bank", label: t("register.payBank") },
                    { id: "toss", label: t("register.payToss") },
                    { id: "kakao", label: t("register.payKakao") },
                  ] as Array<{ id: FormData["payMethod"]; label: string }>).map((p) => {
                    const active = data.payMethod === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setData({ ...data, payMethod: p.id })}
                        aria-pressed={active}
                        style={{
                          padding: "14px 10px",
                          fontSize: 12,
                          borderRadius: 5,
                          textAlign: "center",
                          background: active ? "color-mix(in oklch, var(--lime) 8%, var(--bg-2))" : "var(--bg-2)",
                          color: active ? "var(--ink-0)" : "var(--ink-2)",
                          border: `1px solid ${active ? "var(--lime)" : "var(--line-soft)"}`,
                          cursor: "pointer",
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <div
                className="flex"
                style={{
                  marginTop: 'var(--space-3)',
                  padding: "12px 14px",
                  background: "color-mix(in oklch, var(--aqua) 6%, var(--bg-2))",
                  border: "1px solid color-mix(in oklch, var(--aqua) 25%, var(--line-soft))",
                  borderRadius: 5,
                  fontSize: 11,
                  color: "var(--ink-1)",
                  gap: 10,
                }}
              >
                <span aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: "var(--aqua)" }}>ℹ</span>
                <div>
                  {t("register.paymentGatewayNotice")}
                </div>
              </div>

              <div
                className="flex"
                style={{
                  marginTop: 'var(--space-2)',
                  padding: "10px 14px",
                  background: "var(--bg-2)",
                  borderRadius: 5,
                  fontSize: 11,
                  color: "var(--ink-3)",
                  gap: 'var(--space-2)',
                }}
              >
                <span aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>ℹ</span>
                <span>{t("register.refundPolicy")}</span>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div
            className="flex items-center justify-between"
            style={{ gap: 'var(--space-3)', paddingTop: 'var(--space-5)', marginTop: 'var(--space-5)', borderTop: "1px solid var(--line-soft)" }}
          >
            <Button
              type="button"
              onClick={() => (stepIdx === 0 ? navigate(`/event/${eventId}`) : setStepIdx(stepIdx - 1))}
              disabled={submitting} variant="secondary" size="sm"
            >
              {stepIdx === 0 ? t("message.cancel") : `← ${t("message.back")}`}
            </Button>
            <Button
              type="button"
              onClick={handleNext}
              disabled={!canAdvance || submitting} variant="primary" className="disabled:opacity-50"
            >
              {submitting
                ? t("register.processing")
                : isLastStep
                ? (event.fee ?? 0) > 0
                  ? t("register.submitWithPayment")
                  : t("register.submit")
                : `${t("message.next")} →`}
            </Button>
          </div>
        </Card>

        {/* Sidebar Summary */}
        <Card padding="none" className="event-register-aside" style={{ padding: 18, position: "sticky", top: 68 }}>
          <Text as="div" variant="eyebrow" style={{ marginBottom: 10 }}>{t("register.sidebarTitle")}</Text>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-0)", marginBottom: 'var(--space-1)' }}>{event.name}</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)", marginBottom: 14 }}>
            {fmtDateTime(event.startTime)}
          </div>

          <dl
            className="flex flex-col"
            style={{
              gap: 'var(--space-2)',
              fontSize: 12,
              paddingTop: 14,
              borderTop: "1px solid var(--line-soft)",
              margin: 0,
            }}
          >
            {[
              [t("label.categories"), selectedCat?.name ?? selectedCat?.label ?? t("register.notSelected")],
              [t("register.summaryParticipant"), data.name || "–"],
              [t("distance"), event.distance != null ? `${(event.distance / 1000).toFixed(1)} km` : "–"],
              [t("label.entryFee"), (event.fee ?? 0) > 0 ? `₩ ${(event.fee ?? 0).toLocaleString("ko-KR")}` : t("feeType.free")],
              [t("field.closeAt"), fmtIsoLocal(event.closeAt)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt style={{ color: "var(--ink-3)" }}>{k}</dt>
                <dd style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)", textAlign: "right", margin: 0 }}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>

          {(event.fee ?? 0) > 0 && (
            <div
              className="flex items-baseline justify-between"
              style={{
                marginTop: 'var(--space-4)',
                paddingTop: 14,
                borderTop: "1px solid var(--line-soft)",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("register.paymentDue")}</span>
              <Text variant="dataMedium" style={{ color: "var(--lime)" }}>
                ₩ {totalAmount.toLocaleString("ko-KR")}
              </Text>
            </div>
          )}
        </Card>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .event-register-body { grid-template-columns: 1fr !important; }
          .event-register-aside { position: static !important; }
        }
      `}</style>
    </div>
  );
}
