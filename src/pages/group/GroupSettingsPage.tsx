import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { doc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useGroup } from "../../hooks/useGroup";
import GroupSubNav from "../../components/group/GroupSubNav";
import VisibilityToggle from "../../components/group/VisibilityToggle";
import { generateInviteCode } from "../../utils/inviteCode";
import type { GroupApproval, GroupKind, GroupToggles } from "@shared/types";
import { Button, Card, Text } from "../../theme/components";

export default function GroupSettingsPage() {
  const { t } = useTranslation("group");
  const { groupId } = useParams();
  const { user } = useAuth();
  const { group, loading: groupLoading } = useGroup(groupId);
  const navigate = useNavigate();

  const KIND_LABELS: Record<GroupKind, string> = {
    club: t("dashboard.kind.club"),
    running_crew: t("dashboard.kind.runningCrew"),
    tri_team: t("dashboard.kind.triTeam"),
    corporate: t("dashboard.kind.corporate"),
  };

  const SPORT_OPTIONS: { v: "bike" | "run" | "swim" | "tri"; label: string }[] = [
    { v: "bike", label: t("filter.bike") },
    { v: "run", label: t("filter.run") },
    { v: "swim", label: t("filter.swim") },
    { v: "tri", label: t("filter.tri") },
  ];

  const TOGGLE_LABELS: Record<keyof GroupToggles, { label: string; desc: string }> = {
    postEvents: { label: t("settings.toggles.postEvents"), desc: t("settings.toggles.postEventsDesc") },
    membersPost: { label: t("settings.toggles.membersPost"), desc: t("settings.toggles.membersPostDesc") },
    showInDirectory: { label: t("settings.toggles.showInDirectory"), desc: t("settings.toggles.showInDirectoryDesc") },
    notifyMembers: { label: t("settings.toggles.notifyMembers"), desc: t("settings.toggles.notifyMembersDesc") },
    ridePhotos: { label: t("settings.toggles.ridePhotos"), desc: t("settings.toggles.ridePhotosDesc") },
  };

  const [name, setName] = useState("");
  const [badge, setBadge] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [kind, setKind] = useState<GroupKind>("club");
  const [sports, setSports] = useState<("bike" | "run" | "swim" | "tri")[]>(["bike"]);
  const [approval, setApproval] = useState<GroupApproval>("auto");
  const [rules, setRules] = useState("");
  const [toggles, setToggles] = useState<GroupToggles>({
    postEvents: true,
    membersPost: true,
    showInDirectory: true,
    notifyMembers: true,
    ridePhotos: false,
  });
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (group) {
      setName(group.name);
      setBadge(group.badge ?? "");
      setCity(group.city ?? "");
      setDescription(group.description);
      setVisibility(group.visibility);
      setKind(group.kind ?? "club");
      setSports(group.sports ?? (group.discipline ? [group.discipline] : ["bike"]));
      setApproval(group.approval ?? "auto");
      setRules(group.rules ?? "");
      setToggles({
        postEvents: group.toggles?.postEvents ?? true,
        membersPost: group.toggles?.membersPost ?? true,
        showInDirectory: group.toggles?.showInDirectory ?? true,
        notifyMembers: group.toggles?.notifyMembers ?? true,
        ridePhotos: group.toggles?.ridePhotos ?? false,
      });
    }
  }, [group]);

  const toggleSport = (s: "bike" | "run" | "swim" | "tri") => {
    setSports((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const toggleFlag = (k: keyof GroupToggles) => {
    setToggles((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  if (!user) {
    return (
      <div className="text-center py-16">
        <p style={{ color: "var(--ink-2)" }}>{t("error.creatorOnly")}</p>
      </div>
    );
  }

  if (groupLoading || !group) {
    return (
      <div className="space-y-4 animate-pulse max-w-lg">
        <div className="h-8 w-44 rounded-[var(--r-sm)]" style={{ background: "var(--bg-2)" }} />
        <div className="h-40 rounded-[var(--r-lg)]" style={{ background: "var(--bg-2)" }} />
        <div className="h-24 rounded-[var(--r-lg)]" style={{ background: "var(--bg-2)" }} />
      </div>
    );
  }

  const isCreator = user.uid === group.creatorId;

  // 일반 멤버: 탈퇴만 표시
  if (!isCreator) {
    return (
      <div>
        <GroupSubNav group={group} isCreator={false} />
        <Card padding="none" className="p-6" style={{ borderRadius: 8 }}>
          <h2 className="text-[length:var(--fs-lg)] font-bold mb-4" style={{ color: "var(--ink-0)" }}>{t("button.leave")}</h2>
          <p className="text-[length:var(--fs-sm)] mb-4" style={{ color: "var(--ink-2)" }}>
            {t("settings.leaveDescription")}
          </p>
          <button
            onClick={async () => {
              setLeaving(true);
              try {
                const leaveFn = httpsCallable(functions, "leaveGroup");
                await leaveFn({ groupId });
                navigate("/groups");
              } catch (err) {
                console.error("Leave group failed:", err);
              }
              setLeaving(false);
            }}
            disabled={leaving}
            className="px-4 py-2 text-[length:var(--fs-sm)] font-medium rounded-[var(--r-md)] bg-red-500 text-[var(--ink-0)] hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {leaving ? t("button.saving") : t("button.leave")}
          </button>
        </Card>
      </div>
    );
  }

  const handleSave = async () => {
    if (!groupId || !name.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(firestore, "groups", groupId), {
        name: name.trim(),
        badge: badge.trim().slice(0, 3).toUpperCase() || null,
        city: city.trim() || null,
        description: description.trim(),
        visibility,
        kind,
        sports,
        discipline: sports[0] ?? "bike",
        approval,
        rules: rules.trim() || null,
        toggles,
      });
    } catch (err) {
      console.error("Save failed:", err);
      alert(err instanceof Error ? err.message : t("error.saveFailed"));
    }
    setSaving(false);
  };

  const handleRegenerateCode = async () => {
    if (!groupId) return;
    try {
      const newCode = generateInviteCode();
      await updateDoc(doc(firestore, "groups", groupId), { inviteCode: newCode });
    } catch (err) {
      console.error("Regenerate code failed:", err);
    }
  };

  const handleDelete = async () => {
    if (!groupId) return;
    setDeleting(true);
    try {
      await updateDoc(doc(firestore, "groups", groupId), { isActive: false });
      navigate("/groups");
    } catch (err) {
      console.error("Delete failed:", err);
    }
    setDeleting(false);
  };

  return (
    <div>
      <GroupSubNav group={group} isCreator={isCreator} />

      {/* Breadcrumb */}
      <div className="text-[length:var(--fs-xs)] flex items-center mb-3" style={{ gap: 6, color: "var(--ink-3)" }}>
        <Link to="/groups" style={{ color: "var(--ink-3)" }}>{t("breadcrumb.groups")}</Link>
        <span style={{ color: "var(--ink-4)" }}>/</span>
        <Link to={`/group/${groupId}`} style={{ color: "var(--ink-1)", fontWeight: 500 }}>{group.name}</Link>
        <span style={{ color: "var(--ink-4)" }}>/</span>
        <span style={{ color: "var(--ink-0)" }}>{t("breadcrumb.settings")}</span>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* 프로필 */}
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <h2 className="text-[length:var(--fs-sm)] font-semibold mb-4" style={{ color: "var(--ink-1)" }}>{t("settings.profile")}</h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: "100px 1fr", marginBottom: 'var(--space-4)' }}>
            <div>
              <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("settings.badge")}</Text>
              <input
                type="text"
                value={badge}
                onChange={(e) => setBadge(e.target.value.toUpperCase())}
                placeholder="HRC"
                maxLength={3}
                className="w-full px-3 py-2 rounded-[var(--r-md)] text-[length:var(--fs-sm)]"
                style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-0)", fontFamily: "var(--font-mono)", textAlign: "center", fontWeight: 700, letterSpacing: 2 }}
              />
            </div>
            <div>
              <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("settings.name")}</Text>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-[var(--r-md)] text-[length:var(--fs-sm)]"
                style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-1)" }}
                maxLength={50}
              />
            </div>
          </div>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("settings.location")}</Text>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={t("settings.locationPlaceholder")}
              className="w-full px-3 py-2 rounded-[var(--r-md)] text-[length:var(--fs-sm)]"
              style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-1)" }}
            />
          </div>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("settings.kind")}</Text>
            <div role="radiogroup" aria-label={t("settings.kind")} className="flex items-center flex-wrap" style={{ gap: 6 }}>
              {(Object.keys(KIND_LABELS) as GroupKind[]).map((k) => {
                const active = kind === k;
                return (
                  <Button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setKind(k)} variant="secondary" size="sm"
                    style={{ background: active ? "var(--bg-3)" : "transparent", color: active ? "var(--ink-0)" : "var(--ink-3)", fontWeight: active ? 600 : 400 }}
                  >
                    {KIND_LABELS[k]}
                  </Button>
                );
              })}
            </div>
          </div>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("settings.sports")}</Text>
            <div className="flex items-center flex-wrap" style={{ gap: 6 }}>
              {SPORT_OPTIONS.map((o) => {
                const active = sports.includes(o.v);
                return (
                  <Button
                    key={o.v}
                    type="button"
                    onClick={() => toggleSport(o.v)}
                    aria-pressed={active} variant="secondary" size="sm"
                    style={{ background: active ? "var(--bg-3)" : "transparent", color: active ? "var(--ink-0)" : "var(--ink-3)", fontWeight: active ? 600 : 400 }}
                  >
                    {o.label}
                  </Button>
                );
              })}
            </div>
          </div>
          <div>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("settings.description")}</Text>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-[var(--r-md)] text-[length:var(--fs-sm)] resize-none"
              style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-1)" }}
              rows={3}
              maxLength={200}
            />
          </div>
        </Card>

        {/* 공개 & 가입 */}
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <h2 className="text-[length:var(--fs-sm)] font-semibold mb-4" style={{ color: "var(--ink-1)" }}>{t("settings.visibility")}</h2>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("settings.visibilityLabel")}</Text>
            <VisibilityToggle value={visibility} onChange={setVisibility} />
          </div>
          <div>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("settings.approval")}</Text>
            <div role="radiogroup" aria-label={t("settings.approval")} className="flex items-center" style={{ gap: 6 }}>
              {[
                { v: "auto" as const, label: t("settings.approvalAuto") },
                { v: "manual" as const, label: t("settings.approvalManual") },
              ].map((o) => {
                const active = approval === o.v;
                return (
                  <Button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setApproval(o.v)} variant="secondary" size="sm"
                    style={{ background: active ? "var(--bg-3)" : "transparent", color: active ? "var(--ink-0)" : "var(--ink-3)", fontWeight: active ? 600 : 400 }}
                  >
                    {o.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </Card>

        {/* 권한 토글 */}
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <h2 className="text-[length:var(--fs-sm)] font-semibold mb-4" style={{ color: "var(--ink-1)" }}>{t("settings.permissions")}</h2>
          <div className="flex flex-col" style={{ gap: 10 }}>
            {(Object.keys(TOGGLE_LABELS) as (keyof GroupToggles)[]).map((k) => {
              const meta = TOGGLE_LABELS[k];
              const on = toggles[k];
              return (
                <label key={k} className="flex items-start cursor-pointer" style={{ gap: 10 }}>
                  <input type="checkbox" checked={on} onChange={() => toggleFlag(k)} style={{ marginTop: 3 }} />
                  <div>
                    <div className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-1)" }}>{meta.label}</div>
                    <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{meta.desc}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </Card>

        {/* 그룹 규칙 */}
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <h2 className="text-[length:var(--fs-sm)] font-semibold mb-4" style={{ color: "var(--ink-1)" }}>{t("settings.rules")}</h2>
          <textarea
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            className="w-full px-3 py-2 rounded-[var(--r-md)] text-[length:var(--fs-sm)] resize-none"
            style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-1)" }}
            rows={5}
            maxLength={500}
            placeholder={t("settings.rulesPlaceholder")}
          />
          <div className="text-[length:var(--fs-xs)] text-right mt-1" style={{ color: "var(--ink-4)" }}>{rules.length}/500</div>
        </Card>

        {/* 저장 */}
        <div className="flex items-center justify-end" style={{ gap: 'var(--space-2)' }}>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || saving} variant="primary"
          >
            {saving ? t("button.saving") : t("button.save")}
          </Button>
        </div>

        {/* 초대 코드 */}
        <Card padding="none" className="p-6" style={{ borderRadius: 8 }}>
          <h2 className="text-[length:var(--fs-sm)] font-semibold mb-4" style={{ color: "var(--ink-1)" }}>{t("settings.inviteCode")}</h2>
          <div className="flex items-center gap-2 mb-3">
            <code
              className="flex-1 px-3 py-2 rounded-[var(--r-md)] text-[length:var(--fs-sm)] font-mono"
              style={{ background: "var(--bg-2)", color: "var(--ink-0)" }}
            >
              {group.inviteCode}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(group.inviteCode); }}
              className="px-3 py-2 text-[length:var(--fs-sm)] rounded-[var(--r-md)] transition-colors"
              style={{ background: "var(--bg-2)", color: "var(--ink-1)", border: "1px solid var(--line)" }}
            >
              {t("button.copy")}
            </button>
          </div>
          <button
            onClick={handleRegenerateCode}
            className="text-[length:var(--fs-xs)]"
            style={{ color: "var(--lime)" }}
          >
            {t("button.regenerateCode")}
          </button>
        </Card>

        {/* 그룹 삭제 */}
        <Card padding="none" className="p-6"
          style={{ borderRadius: 8, borderColor: "rgba(239,68,68,0.3)" }}
        >
          <h2 className="text-[length:var(--fs-sm)] font-semibold text-red-500 mb-2">{t("settings.dangerZone")}</h2>
          <p className="text-[length:var(--fs-xs)] mb-4" style={{ color: "var(--ink-2)" }}>
            {t("settings.deleteDescription")}
          </p>
          {showDeleteConfirm ? (
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-[length:var(--fs-sm)] font-medium rounded-[var(--r-md)] bg-red-500 text-[var(--ink-0)] hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {deleting ? t("button.saving") : t("button.confirmDelete")}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-[length:var(--fs-sm)] rounded-[var(--r-md)]"
                style={{ background: "var(--bg-2)", color: "var(--ink-2)" }}
              >
                {t("button.cancel")}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 text-[length:var(--fs-sm)] font-medium rounded-[var(--r-md)] border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              {t("button.deleteGroup")}
            </button>
          )}
        </Card>
      </div>
    </div>
  );
}
