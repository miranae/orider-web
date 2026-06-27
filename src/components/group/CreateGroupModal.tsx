import { useState, useMemo } from "react";
import { collection, doc, writeBatch } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { firestore } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import Modal from "../Modal";
import { generateInviteCode } from "../../utils/inviteCode";
import type { GroupKind, GroupApproval } from "@shared/types";
import { Button, Card, Text } from "../../theme/components";

interface CreateGroupModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (groupId: string, name: string) => void;
}

function defaultBadge(name: string): string {
  const t = name.trim();
  if (!t) return "";
  const ascii = /^[A-Za-z\s]+$/.test(t);
  if (ascii) {
    const words = t.split(/\s+/).filter(Boolean);
    return words.slice(0, 3).map((w) => w[0]?.toUpperCase() ?? "").join("") || t.slice(0, 3).toUpperCase();
  }
  return t.slice(0, 2);
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "var(--bg-2)",
  border: "1px solid var(--line-soft)",
  borderRadius: "var(--r-md)",
  color: "var(--ink-0)",
  fontSize: 14,
  fontFamily: "inherit",
};

export default function CreateGroupModal({ open, onClose, onCreated }: CreateGroupModalProps) {
  const { user } = useAuth();
  const { t } = useTranslation("group");
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<GroupKind>("club");
  const [name, setName] = useState("");
  const [badge, setBadge] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [sports, setSports] = useState<("bike" | "run" | "swim" | "tri")[]>(["bike"]);
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [approval, setApproval] = useState<GroupApproval>("auto");
  const [rules, setRules] = useState("");
  const [invites, setInvites] = useState("");
  const [creating, setCreating] = useState(false);

  const KINDS = useMemo<{ id: GroupKind; label: string; desc: string }[]>(() => [
    { id: "club", label: t("create.kind.club"), desc: t("create.kind.club.desc") },
    { id: "running_crew", label: t("create.kind.runningCrew"), desc: t("create.kind.runningCrew.desc") },
    { id: "tri_team", label: t("create.kind.triTeam"), desc: t("create.kind.triTeam.desc") },
    { id: "corporate", label: t("create.kind.corporate"), desc: t("create.kind.corporate.desc") },
  ], [t]);

  const SPORT_OPTIONS = useMemo<{ v: "bike" | "run" | "swim" | "tri"; label: string }[]>(() => [
    { v: "bike", label: t("create.sport.bike") },
    { v: "run", label: t("create.sport.run") },
    { v: "swim", label: t("create.sport.swim") },
    { v: "tri", label: t("create.sport.tri") },
  ], [t]);

  const STEPS = useMemo(() => [t("create.step.basic"), t("create.step.rules"), t("create.step.invite")], [t]);

  if (!user) return null;

  const reset = () => {
    setStep(0);
    setKind("club");
    setName("");
    setBadge("");
    setCity("");
    setDescription("");
    setSports(["bike"]);
    setVisibility("private");
    setApproval("auto");
    setRules("");
    setInvites("");
  };

  const close = () => {
    reset();
    onClose();
  };

  const toggleSport = (s: "bike" | "run" | "swim" | "tri") => {
    setSports((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const canNext =
    step === 0
      ? name.trim().length >= 2 && (badge.trim() || defaultBadge(name)).length >= 2 && sports.length > 0
      : step === 1
      ? true
      : true;

  const handleCreate = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const groupRef = doc(collection(firestore, "groups"));
      const groupId = groupRef.id;
      const now = Date.now();
      const finalBadge = (badge.trim() || defaultBadge(name)).slice(0, 3).toUpperCase();
      const primaryDiscipline = sports[0] ?? "bike";

      const batch = writeBatch(firestore);
      batch.set(groupRef, {
        name: name.trim(),
        description: description.trim(),
        creatorId: user.uid,
        createdAt: now,
        isActive: true,
        inviteCode: generateInviteCode(),
        visibility,
        kind,
        city: city.trim() || null,
        badge: finalBadge,
        sports,
        discipline: primaryDiscipline,
        approval,
        rules: rules.trim() || null,
        toggles: {
          postEvents: true,
          membersPost: true,
          showInDirectory: true,
          notifyMembers: true,
          ridePhotos: false,
        },
        memberCount: 1,
      });
      batch.set(doc(firestore, "groups", groupId, "members", user.uid), {
        joinedAt: now,
        status: "active",
        userId: user.uid,
        role: "leader",
      });
      batch.set(doc(firestore, "user_groups", user.uid, "groups", groupId), {
        groupId,
        joinedAt: now,
      });
      // 초대된 이메일을 invites 컬렉션에 기록 (실제 발송은 후속 CF에서)
      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const inviteList = invites
        .split(/[\s,;\n]+/)
        .map((s) => s.trim())
        .filter((s) => EMAIL_RE.test(s));
      for (const email of inviteList) {
        const invRef = doc(collection(firestore, "groups", groupId, "invitations"));
        batch.set(invRef, {
          email,
          invitedBy: user.uid,
          invitedAt: now,
          status: "pending",
        });
      }
      await batch.commit();

      const createdName = name.trim();
      reset();
      onCreated(groupId, createdName);
    } catch (err) {
      console.error("Create group failed:", err);
      alert(err instanceof Error ? err.message : t("create.failed"));
    }
    setCreating(false);
  };

  return (
    <Modal open={open} onClose={close} title={t("create.modalTitle")}>
      {/* Stepper */}
      <ol role="list" className="flex items-center" style={{ gap: 'var(--space-2)', listStyle: "none", padding: 0, marginBottom: 'var(--space-5)' }}>
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={label} className="flex items-center" style={{ gap: 'var(--space-2)', flex: 1 }}>
              <div
                style={{
                  width: 24, height: 24, borderRadius: "50%",
                  display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700,
                  background: done || active ? "var(--lime)" : "var(--bg-2)",
                  color: done || active ? "var(--primary-fg)" : "var(--ink-3)",
                  border: "1px solid var(--line-soft)",
                  flexShrink: 0,
                }}
              >
                {done ? "✓" : i + 1}
              </div>
              <span className="text-[length:var(--fs-xs)]" style={{ color: active ? "var(--ink-0)" : "var(--ink-3)", fontWeight: active ? 600 : 400 }}>
                {label}
              </span>
              {i < STEPS.length - 1 && <div style={{ height: 1, flex: 1, background: done ? "var(--lime)" : "var(--line-soft)" }} />}
            </li>
          );
        })}
      </ol>

      {/* Step 0 — 기본 정보 */}
      {step === 0 && (
        <div className="flex flex-col" style={{ gap: 'var(--space-4)' }}>
          <div>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("create.kindLabel")}</Text>
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map((k) => {
                const active = kind === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKind(k.id)}
                    className="text-left"
                    style={{
                      padding: "10px 12px",
                      border: "1px solid",
                      borderColor: active ? "var(--lime)" : "var(--line-soft)",
                      background: active ? "color-mix(in oklch, var(--lime) 8%, var(--bg-2))" : "var(--bg-2)",
                      borderRadius: "var(--r-md)",
                      cursor: "pointer",
                    }}
                  >
                    <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{k.label}</div>
                    <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>{k.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 100px" }}>
            <label className="flex flex-col" style={{ gap: 6 }}>
              <Text variant="eyebrow">{t("create.nameLabel")}</Text>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("create.namePlaceholder")}
                maxLength={40}
                style={inputStyle}
              />
            </label>
            <label className="flex flex-col" style={{ gap: 6 }}>
              <Text variant="eyebrow">{t("create.badgeLabel")}</Text>
              <input
                type="text"
                value={badge}
                onChange={(e) => setBadge(e.target.value.toUpperCase())}
                placeholder={defaultBadge(name) || "HRC"}
                maxLength={3}
                style={{ ...inputStyle, fontFamily: "var(--font-mono)", textAlign: "center", fontWeight: 700, letterSpacing: 2 }}
              />
            </label>
          </div>

          <label className="flex flex-col" style={{ gap: 6 }}>
            <Text variant="eyebrow">{t("create.cityLabel")}</Text>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={t("create.cityPlaceholder")}
              style={inputStyle}
            />
          </label>

          <label className="flex flex-col" style={{ gap: 6 }}>
            <Text variant="eyebrow">{t("create.descLabel")}</Text>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={200}
              placeholder={t("create.descPlaceholder")}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>

          <div>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("create.sportsLabel")}</Text>
            <div className="flex items-center flex-wrap" style={{ gap: 6 }}>
              {SPORT_OPTIONS.map((o) => {
                const active = sports.includes(o.v);
                return (
                  <Button
                    key={o.v}
                    type="button"
                    onClick={() => toggleSport(o.v)}
                    aria-pressed={active} variant="secondary" size="sm"
                    style={{
                      background: active ? "var(--bg-3)" : "transparent",
                      color: active ? "var(--ink-0)" : "var(--ink-3)",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {o.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Step 1 — 규칙 & 공개 */}
      {step === 1 && (
        <div className="flex flex-col" style={{ gap: 'var(--space-4)' }}>
          <div>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("create.visibilityLabel")}</Text>
            <div role="radiogroup" aria-label={t("create.visibilityAria")} className="flex flex-col" style={{ gap: 6 }}>
              {[
                { v: "public" as const, label: t("create.visibility.public"), desc: t("create.visibility.public.desc") },
                { v: "private" as const, label: t("create.visibility.private"), desc: t("create.visibility.private.desc") },
              ].map((o) => {
                const active = visibility === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setVisibility(o.v)}
                    className="text-left"
                    style={{
                      padding: 'var(--space-3)',
                      border: "1px solid",
                      borderColor: active ? "var(--lime)" : "var(--line-soft)",
                      background: active ? "color-mix(in oklch, var(--lime) 8%, var(--bg-2))" : "var(--bg-2)",
                      borderRadius: "var(--r-md)",
                      cursor: "pointer",
                    }}
                  >
                    <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{o.label}</div>
                    <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>{o.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("create.approvalLabel")}</Text>
            <div role="radiogroup" aria-label={t("create.approvalAria")} className="flex items-center" style={{ gap: 6 }}>
              {[
                { v: "auto" as const, label: t("create.approval.auto") },
                { v: "manual" as const, label: t("create.approval.manual") },
              ].map((o) => {
                const active = approval === o.v;
                return (
                  <Button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setApproval(o.v)} variant="secondary" size="sm"
                    style={{
                      background: active ? "var(--bg-3)" : "transparent",
                      color: active ? "var(--ink-0)" : "var(--ink-3)",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {o.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <label className="flex flex-col" style={{ gap: 6 }}>
            <Text variant="eyebrow">{t("create.rulesLabel")}</Text>
            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder={t("create.rulesPlaceholder")}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>
        </div>
      )}

      {/* Step 2 — 멤버 초대 */}
      {step === 2 && (
        <div className="flex flex-col" style={{ gap: 'var(--space-4)' }}>
          <div>
            <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)", marginBottom: 'var(--space-2)' }}>{t("create.inviteHeading")}</div>
            <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", marginBottom: 'var(--space-2)' }}>
              {t("create.inviteHelp")}
            </div>
            <textarea
              value={invites}
              onChange={(e) => setInvites(e.target.value)}
              rows={4}
              placeholder="rider1@example.com, rider2@example.com"
              style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 13 }}
            />
          </div>

          <Card padding="none" style={{ padding: 'var(--space-3)', background: "var(--bg-2)" }}>
            <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", lineHeight: 1.5 }}>
              {t("create.inviteCalloutPrefix")}
              <strong style={{ color: "var(--ink-1)" }}>{t("create.inviteCalloutBold")}</strong>
              {t("create.inviteCalloutSuffix")}
            </div>
          </Card>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-6)' }}>
        <Button
          type="button"
          onClick={() => (step === 0 ? close() : setStep(step - 1))}
          disabled={creating} variant="secondary"
        >
          {step === 0 ? t("create.cancel") : t("create.prev")}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            onClick={() => canNext && setStep(step + 1)}
            disabled={!canNext} variant="primary"
          >
            {t("create.next")}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleCreate}
            disabled={creating || !name.trim()} variant="primary"
          >
            {creating ? t("create.submitting") : t("create.submit")}
          </Button>
        )}
      </div>
    </Modal>
  );
}
