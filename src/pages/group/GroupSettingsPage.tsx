import { isSportUiEnabled } from "../../config/sportFeatures";
import { handleGroupChoiceKey } from "../../features/group/groupControlKeys";
import { Users } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { doc, updateDoc } from "firebase/firestore";
import { auth, firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import { useDialog } from "../../contexts/DialogContext";
import { useToast } from "../../contexts/ToastContext";
import { useGroup, useGroupMemberRole } from "../../hooks/useGroup";
import { canManageGroup } from "../../features/group/groupPermissions";
import GroupSubNav from "../../components/group/GroupSubNav";
import VisibilityToggle from "../../components/group/VisibilityToggle";
import { EmptyState, ErrorState } from "../../components/redesign";
import type { GroupApproval, GroupKind, GroupToggles } from "@shared/types";
import { Button, Card, Switch, Text, Input, Textarea } from "../../theme/components";
import { ICON_SIZE } from "../../theme/tokens/icon";

export default function GroupSettingsPage() {
  const { t } = useTranslation("group");
  const { groupId } = useParams();
  const { user } = useAuth();
  const { group, loading: groupLoading, error: groupError, retry: retryGroup } = useGroup(groupId);
  const { role: currentMemberRole, loading: roleLoading, error: roleError, retry: retryRole } = useGroupMemberRole(groupId, user?.uid);
  const navigate = useNavigate();
  const dialog = useDialog();
  const { showToast } = useToast();

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
  const [monthlyGoalKm, setMonthlyGoalKm] = useState(0);
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
  const seededGroupIdRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const editRevision = useRef(0);
  const saveContext = useRef(0);

  const markDirty = () => {
    editRevision.current += 1;
    dirtyRef.current = true; setDirty(true);
  };

  useEffect(() => {
    saveContext.current += 1;
    editRevision.current += 1;
    dirtyRef.current = false; setDirty(false);
    setSaving(false); setDeleting(false); setShowDeleteConfirm(false);
    seededGroupIdRef.current = null;
    return () => { saveContext.current += 1; };
  }, [groupId, user?.uid]);

  useEffect(() => {
    if (group && groupId && groupId !== seededGroupIdRef.current && !dirtyRef.current) {
      seededGroupIdRef.current = groupId;
      setName(group.name);
      setBadge(group.badge ?? "");
      setCity(group.city ?? "");
      setDescription(group.description);
      setVisibility(group.visibility);
      setKind(group.kind ?? "club");
      setSports(group.sports ?? (group.discipline ? [group.discipline] : ["bike"]));
      setApproval(group.approval ?? "auto");
      setRules(group.rules ?? "");
      setMonthlyGoalKm(group.monthlyGoalKm ?? 0);
      setToggles({
        postEvents: group.toggles?.postEvents ?? true,
        membersPost: group.toggles?.membersPost ?? true,
        showInDirectory: group.toggles?.showInDirectory ?? true,
        notifyMembers: group.toggles?.notifyMembers ?? true,
        ridePhotos: group.toggles?.ridePhotos ?? false,
      });
    }
  }, [group, groupId, user?.uid]);

  const toggleSport = (s: "bike" | "run" | "swim" | "tri") => {
    markDirty();
    setSports((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const toggleFlag = (k: keyof GroupToggles) => {
    markDirty();
    setToggles((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const isCreator = !!user && !!group && user.uid === group.creatorId;
  const canManage = canManageGroup(group, user?.uid, currentMemberRole);

  if (!user) {
    return (
      <div className="text-center py-16">
        <p style={{ color: "var(--ink-2)" }}>{t("error.creatorOnly")}</p>
      </div>
    );
  }

  if (groupLoading || roleLoading) {
    return (
      <div className="space-y-4 animate-pulse max-w-lg">
        <div className="h-8 w-44 rounded-[var(--r-sm)]" style={{ background: "var(--bg-2)" }} />
        <div className="h-40 rounded-[var(--r-lg)]" style={{ background: "var(--bg-2)" }} />
        <div className="h-24 rounded-[var(--r-lg)]" style={{ background: "var(--bg-2)" }} />
      </div>
    );
  }

  if (groupError || roleError) return <ErrorState title={t("error.loadFailed")} onRetry={roleError ? retryRole : retryGroup} />;

  if (!group) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon={<Users size={ICON_SIZE.lg} style={{marginInline:"auto"}} />}
          title={t("empty.groupNotFound")}
          actions={[{ label: t("empty.goToList"), variant: "primary", href: "/clubs" }]}
        />
      </div>
    );
  }

  if (!canManage) return <Navigate to=".." relative="path" replace />;

  const handleSave = async () => {
    if (!groupId || !user || !name.trim() || saving) return;
    const context = saveContext.current;
    const revision = editRevision.current;
    const uid = user.uid;
    const current = () => context === saveContext.current && auth.currentUser?.uid === uid;
    if (!current()) return;
    setSaving(true);
    try {
      await updateDoc(doc(firestore, "groups", groupId), {
        name: name.trim(),
        badge: badge.trim().slice(0, 3).toUpperCase() || null,
        city: city.trim() || null,
        description: description.trim(),
        ...(isCreator ? {
          visibility,
          kind,
          sports,
          discipline: sports[0] ?? "bike",
          approval,
        } : {}),
        rules: rules.trim() || null,
        toggles,
        monthlyGoalKm: Math.max(0, Math.min(1_000_000, monthlyGoalKm)),
      });
      if (!current()) return;
      if (revision === editRevision.current) { dirtyRef.current = false; setDirty(false); }
      showToast(t("settings.saveSuccess"));
    } catch (err) {
      if (!current()) return;
      logClientError("GroupSettingsPage.handleSave", err, { groupId, visibility, kind, approval });
      void dialog.alert(err instanceof Error ? err.message : t("error.saveFailed"), { variant: "danger" });
    }
    if (current()) setSaving(false);
  };

  const handleDelete = async () => {
    if (!groupId || !user || deleting) return;
    const uid = user.uid; const context = saveContext.current;
    const current = () => context === saveContext.current && auth.currentUser?.uid === uid;
    if (!current()) return;
    setDeleting(true);
    try {
      await updateDoc(doc(firestore, "groups", groupId), { isActive: false });
      if (!current()) return;
      showToast(t("settings.deleteSuccess"));
      navigate("/clubs");
    } catch (err) {
      if (!current()) return;
      logClientError("GroupSettingsPage.handleDelete", err, { groupId });
      showToast(t("error.deleteFailed"), "error");
    }
    if (current()) setDeleting(false);
  };

  return (
    <div className="club-surface club-settings">
      <GroupSubNav group={group} isCreator={canManage} showDescription={false} />
      <div className="club-settings-grid">
        <div className="club-settings-main">
        {/* 프로필 */}
        <Card data-testid="C7-4" padding="none" style={{ padding: 'var(--space-5)' }}>
          <h2 className="text-[length:var(--ft-title-size)] font-semibold mb-4" style={{ color: "var(--ink-1)" }}>{t("settings.profile")}</h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: "100px 1fr", marginBottom: 'var(--space-4)' }}>
            <div>
              <label className="club-settings-label" htmlFor="club-settings-badge">{t("settings.badge")}</label>
              <Input id="club-settings-badge"
                type="text"
                value={badge}
                onChange={(e) => {
                  markDirty();
                  setBadge(e.target.value.toUpperCase());
                }}
                placeholder="HRC"
                maxLength={3}
                className="w-full px-3 py-2 rounded-[var(--r-md)] text-[length:var(--ft-body-medium-size)]"
                style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-0)", fontFamily: "var(--font-mono)", textAlign: "center", fontWeight: 700, letterSpacing: 2 }}
              />
            </div>
            <div>
              <label className="club-settings-label" htmlFor="club-settings-name">{t("settings.name")}</label>
              <Input id="club-settings-name" data-testid="C7-4-1"
                type="text"
                value={name}
                onChange={(e) => {
                  markDirty();
                  setName(e.target.value);
                }}
                className="w-full px-3 py-2 rounded-[var(--r-md)] text-[length:var(--ft-body-medium-size)]"
                style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-1)" }}
                maxLength={50}
              />
            </div>
          </div>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label className="club-settings-label" htmlFor="club-settings-city">{t("settings.location")}</label>
            <Input id="club-settings-city"
              type="text"
              value={city}
              onChange={(e) => {
                markDirty();
                setCity(e.target.value);
              }}
              placeholder={t("settings.locationPlaceholder")}
              className="w-full px-3 py-2 rounded-[var(--r-md)] text-[length:var(--ft-body-medium-size)]"
              style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-1)" }}
            />
          </div>
          {isCreator && <div style={{ marginBottom: 'var(--space-4)' }}>
            <Text as="div" variant="bodyMedium" style={{ marginBottom: "var(--space-1-5)" }}>{t("settings.kind")}</Text>
            <div role="radiogroup" onKeyDown={event=>handleGroupChoiceKey(event,"radio")} aria-label={t("settings.kind")} className="flex items-center flex-wrap" style={{ gap: "var(--space-1-5)" }}>
              {(Object.keys(KIND_LABELS) as GroupKind[]).map((k) => {
                const active = kind === k;
                return (
                  <Button
                    key={k}
                    type="button"
                    role="radio"
                    tabIndex={active ? 0 : -1}
                    aria-checked={active}
                    onClick={() => {
                      markDirty();
                      setKind(k);
                    }} variant="secondary" size="sm"
                    style={{ background: active ? "var(--bg-3)" : "transparent", color: active ? "var(--ink-0)" : "var(--ink-3)", fontWeight: active ? 600 : 400 }}
                  >
                    {KIND_LABELS[k]}
                  </Button>
                );
              })}
            </div>
          </div>}
          {isCreator && <div style={{ marginBottom: 'var(--space-4)' }}>
            <Text as="div" variant="bodyMedium" style={{ marginBottom: "var(--space-1-5)" }}>{t("settings.sports")}</Text>
            <div role="group" aria-label={t("settings.sports")} className="flex items-center flex-wrap" style={{ gap: "var(--space-1-5)" }}>
              {SPORT_OPTIONS.filter(option => isSportUiEnabled(option.v)).map((o) => {
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
          </div>}
          <div>
            <label className="club-settings-label" htmlFor="club-settings-description">{t("settings.description")}</label>
            <Textarea id="club-settings-description"
              value={description}
              onChange={(e) => {
                markDirty();
                setDescription(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-[var(--r-md)] text-[length:var(--ft-body-medium-size)] resize-none"
              style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-1)" }}
              rows={3}
              maxLength={200}
            />
          </div>
        </Card>

        {/* 그룹 규칙 */}
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <h2 className="text-[length:var(--ft-title-size)] font-semibold mb-4" style={{ color: "var(--ink-1)" }}><label htmlFor="club-settings-rules">{t("settings.rules")}</label></h2>
          <Textarea id="club-settings-rules"
            value={rules}
            onChange={(e) => {
              markDirty();
              setRules(e.target.value);
            }}
            className="w-full px-3 py-2 rounded-[var(--r-md)] text-[length:var(--ft-body-medium-size)] resize-none"
            style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-1)" }}
            rows={5}
            maxLength={500}
            placeholder={t("settings.rulesPlaceholder")}
          />
          <div className="text-[length:var(--ft-body-size)] text-right mt-1" style={{ color: "var(--ink-4)" }}>{rules.length}/500</div>
        </Card>

        </div>
        <div className="club-settings-aside">
        {/* 공개 & 가입 */}
        {isCreator && <Card data-testid="C7-4-2" padding="none" style={{ padding: 'var(--space-5)' }}>
          <h2 className="text-[length:var(--ft-title-size)] font-semibold mb-4" style={{ color: "var(--ink-1)" }}>{t("settings.visibility")}</h2>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Text as="div" variant="bodyMedium" style={{ marginBottom: "var(--space-1-5)" }}>{t("settings.visibilityLabel")}</Text>
            <VisibilityToggle value={visibility} onChange={(next) => {
              markDirty();
              setVisibility(next);
            }} />
          </div>
          <div>
            <Text as="div" variant="bodyMedium" style={{ marginBottom: "var(--space-1-5)" }}>{t("settings.approval")}</Text>
            <div role="radiogroup" onKeyDown={event=>handleGroupChoiceKey(event,"radio")} aria-label={t("settings.approval")} className="flex items-center flex-wrap" style={{ gap: "var(--space-1-5)" }}>
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
                    tabIndex={active ? 0 : -1}
                    aria-checked={active}
                    onClick={() => {
                      markDirty();
                      setApproval(o.v);
                    }} variant="secondary" size="sm"
                    style={{ background: active ? "var(--bg-3)" : "transparent", color: active ? "var(--ink-0)" : "var(--ink-3)", fontWeight: active ? 600 : 400 }}
                  >
                    {o.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </Card>}

        <section data-testid="C7-5"><Card data-testid="C7-5-1" padding="none" style={{padding:'var(--space-5)'}}>
          <h2 className="club-card-title mb-4">{t("settings.permissions")}</h2>
          {([
            {title: "settings.permissionsSharing", keys: ["membersPost", "ridePhotos", "showInDirectory"]},
            {title: "settings.permissionsNotifications", keys: ["notifyMembers", "postEvents"]},
          ] as const).map(section => <section key={section.title} className="club-settings-toggle-section">
            <Text as="h3" variant="subtitle">{t(section.title)}</Text>
            {section.keys.map(key => <div key={key} className="club-settings-toggle-row">
              <div><label htmlFor={`club-settings-${key}`} className="club-settings-label">{TOGGLE_LABELS[key].label}</label><p id={`club-settings-${key}-hint`}>{TOGGLE_LABELS[key].desc}</p></div>
              <Switch id={`club-settings-${key}`} aria-describedby={`club-settings-${key}-hint`} checked={toggles[key]} onChange={()=>toggleFlag(key)} />
            </div>)}
          </section>)}
        </Card></section>

        {/* 월간 팀 목표 */}
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <h2 className="text-[length:var(--ft-title-size)] font-semibold mb-2" style={{ color: "var(--ink-1)" }}><label htmlFor="club-settings-monthly-goal">{t("settings.monthlyGoal.title")}</label></h2>
          <p className="text-[length:var(--ft-body-size)] mb-3" style={{ color: "var(--ink-3)" }}>{t("settings.monthlyGoal.desc")}</p>
          <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
            <Input id="club-settings-monthly-goal"
              type="number"
              min={0}
              max={1_000_000}
              step={10}
              value={monthlyGoalKm}
              onChange={(event) => {
                markDirty();
                setMonthlyGoalKm(Number(event.target.value) || 0);
              }}
              className="px-3 py-2 rounded-[var(--r-md)] text-[length:var(--ft-body-medium-size)]"
              style={{ width: 160, background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-1)" }}
            />
            <Text variant="unit">km</Text>
          </div>
        </Card>

        </div>
      </div>
        {/* 저장 */}
        <div className="club-settings-save-bar">
          <Text as="p" variant="body" tone="secondary" role="status">{saving ? t("button.saving") : dirty ? t("settings.unsavedChanges") : t("settings.noChanges")}</Text>
          <Button data-testid="C7-0"
            onClick={handleSave}
            disabled={!dirty || !name.trim() || saving} variant="primary"
          >
            {saving ? t("button.saving") : t("button.save")}
          </Button>
        </div>

        {/* 그룹 삭제는 소유권이 있는 생성자에게만 허용한다. */}
        {isCreator && <section data-testid="C7-7"><Card data-testid="C7-7-1" padding="none" style={{padding:"var(--space-5)",borderColor:"color-mix(in srgb, var(--rose) 30%, transparent)"}}
        >
          <details className="club-settings-danger"><summary>{t("settings.dangerZone")}</summary><div className="mt-4">
          <p className="text-[length:var(--ft-body-size)] mb-2" style={{ color: "var(--ink-2)" }}>
            {t("settings.deleteDescription")}
          </p>
          {/* #379: 그룹장의 유일한 출구가 '삭제'로 보이지 않도록 이임 동선을 위험 구역에서 직접 노출 */}
          <p className="text-[length:var(--ft-body-size)] mb-4" style={{ color: "var(--ink-2)" }}>
            {t("settings.transferHint")}{" "}
            <Link data-testid="C7-7-2" to={`/club/${groupId}/members?section=leadership`} style={{ color: "var(--lime)", fontWeight: 500 }}>
              {t("settings.transferLink")}
            </Link>
          </p>
          {showDeleteConfirm ? (
            <div className="flex gap-2">
              <Button variant="danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? t("button.saving") : t("button.confirmDelete")}
              </Button>
              <Button variant="secondary"
                onClick={() => setShowDeleteConfirm(false)}
              >
                {t("button.cancel")}
              </Button>
            </div>
          ) : (
            <Button variant="danger"
              onClick={() => setShowDeleteConfirm(true)}
            >
              {t("button.deleteGroup")}
            </Button>
          )}
          </div></details>
        </Card></section>}
    </div>
  );
}
