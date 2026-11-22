import { PublicDataSettingsCard } from "./PublicDataSettingsCard";
import { NotificationPreferencesCard } from "./NotificationPreferencesCard";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, ChevronRight, Copy, Eye, Globe, Trash2, User } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { updateProfile } from "firebase/auth";

import type { Visibility } from "@shared/types";
import { profileAvatarPath, profileAvatarUrl, resolveProfilePhotoUrl } from "@shared/profileAvatar";
import { auth, firestore, functions, storage } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useDialog } from "../../contexts/DialogContext";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { refreshProfileAvatar } from "../../hooks/useProfileAvatarDisplayUrl";
import { logClientError } from "../../services/errorLogger";

import { SettingsCard, FieldGrid, Field, InlineRow, Toggle, fieldInputStyle } from "./_primitives";
import { ProfileBodyEditor } from "./ProfileBodyEditor";
import { PaneMedical } from "./PaneMedical";
import { ProfileHero } from "./ProfileHero";
import { LocalizedLink } from "../LocalizedLink";
import { PaneAiCoach } from "./PaneAiCoach";
import { SocialLinksCard } from "./SocialLinksCard";
import { Button, IconButton, Textarea, buttonClass } from "../../theme/components";
import { ICON_SIZE } from "../../theme/tokens/icon";

type VisOpt = { value: Visibility; labelKey: string; icon: typeof User };

const VIS_OPTS: VisOpt[] = [
  { value: "everyone", labelKey: "privacy.visOptEveryone", icon: Globe },
  { value: "friends", labelKey: "privacy.visOptFriends", icon: User },
  { value: "private", labelKey: "privacy.visOptPrivate", icon: Eye },
];

function withPhotoLock(uid: string, operation: () => Promise<void>) {
  return navigator.locks?.request(`profile-avatar:${uid}`, operation) ?? operation();
}

export function PaneAccount() {
  const { t } = useTranslation("settings");
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const dialog = useDialog();

  const [bio, setBio] = useState(profile?.bio ?? "");
  const [bioSaving, setBioSaving] = useState(false);
  const [profilePublic, setProfilePublic] = useState(profile?.profilePublic ?? true);
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(profile?.leaderboardOptIn ?? false);
  const [friendRequestsAllowed, setFriendRequestsAllowed] = useState(
    profile?.friendRequestsAllowed ?? true,
  );
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [bulkVisibilitySaving, setBulkVisibilitySaving] = useState(false);
  const [visibilityAvailability, setVisibilityAvailability] = useState<"ready" | "error">("ready");
  const [existingActivityCount, setExistingActivityCount] = useState<number | null>(null);
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoOverride, setPhotoOverride] = useState<{ uid: string; url: string | null }>();
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBio(profile?.bio ?? "");
    setProfilePublic(profile?.profilePublic ?? true);
    setLeaderboardOptIn(profile?.leaderboardOptIn ?? false);
    setFriendRequestsAllowed(profile?.friendRequestsAllowed ?? true);
  }, [
    profile?.bio,
    profile?.profilePublic,
    profile?.leaderboardOptIn,
    profile?.friendRequestsAllowed,
  ]);

  useEffect(() => {
    if (!user) return;
    void getDoc(doc(firestore, "users", user.uid)).then((snap) => {
      const code = snap.data()?.friendCode;
      if (typeof code === "string") setFriendCode(code);
    });
  }, [user]);

  useEffect(() => {
    setVisibilityAvailability("ready");
    setExistingActivityCount(null);
  }, [user?.uid]);

  useEffect(() => {
    if (photoOverride && (photoOverride.uid !== user?.uid || photoOverride.url === profile?.photoURL)) setPhotoOverride(undefined);
  }, [photoOverride, profile?.photoURL, user?.uid]);
  const ownPhotoOverride = photoOverride?.uid === user?.uid ? photoOverride : undefined;
  const savedPhotoURL = resolveProfilePhotoUrl(profile?.photoURL, user?.photoURL);
  const photoURL = ownPhotoOverride ? ownPhotoOverride.url : savedPhotoURL;
  if (!user) return null;
  const currentVisibility: Visibility = profile?.defaultVisibility ?? "private";

  async function handleSaveNickname() {
    if (!user || nicknameSaving) return;
    const v = await dialog.prompt(t("profile.nicknamePrompt"), { defaultValue: profile?.nickname ?? "" });
    const trimmed = v?.trim();
    if (!trimmed) return;
    if (trimmed.length < 2 || trimmed.length > 30) {
      showToast(t("profile.nicknameLength"));
      return;
    }
    setNicknameSaving(true);
    try {
      showToast(t("profile.nicknameSaving"));
      await updateDoc(doc(firestore, "users", user.uid), { nickname: trimmed });
      if (auth.currentUser) {
        try {
          await updateProfile(auth.currentUser, { displayName: trimmed });
        } catch (authErr) {
          logClientError("PaneAccount.syncAuthDisplayName", authErr, { uid: user.uid });
          showToast(t("profile.nicknameAuthSyncFailed"));
        }
      }
      const activitiesSnap = await getDocs(
        query(collection(firestore, "activities"), where("userId", "==", user.uid)),
      );
      // Firestore writeBatch는 500 op까지만 허용. 활동이 많은 사용자도 host limit
      // 에러 없이 모두 갱신되도록 청크로 분할 commit.
      const BATCH_LIMIT = 500;
      for (let i = 0; i < activitiesSnap.docs.length; i += BATCH_LIMIT) {
        const slice = activitiesSnap.docs.slice(i, i + BATCH_LIMIT);
        if (slice.length === 0) break;
        const batch = writeBatch(firestore);
        slice.forEach((d) => batch.update(d.ref, { nickname: trimmed }));
        await batch.commit();
      }
      showToast(t("profile.nicknameUpdated"));
    } catch (e) {
      showToast(`${t("profile.nicknameSaveFailed")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setNicknameSaving(false);
    }
  }

  async function handleSaveBio() {
    if (!user || bio === (profile?.bio ?? "") || bioSaving) return;
    setBioSaving(true);
    try {
      await updateDoc(doc(firestore, "users", user.uid), { bio });
      showToast(t("profile.bioSaved"));
    } catch {
      showToast(t("profile.bioSaveFailed"));
    } finally {
      setBioSaving(false);
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user || user.isAnonymous || photoUploading) return;
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast(t("profile.imageOnly"));
      return;
    }
    setPhotoUploading(true);
    let stage = "encode";
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      try {
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas context unavailable");
        const min = Math.min(bitmap.width, bitmap.height);
        ctx.drawImage(bitmap, (bitmap.width - min) / 2, (bitmap.height - min) / 2, min, min, 0, 0, 512, 512);
      } finally {
        bitmap.close();
      }
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/webp", 0.8),
      );
      if (!blob.type.startsWith("image/") || blob.size >= 2 * 1024 * 1024) throw new Error("Invalid avatar encoding");
      await withPhotoLock(user.uid, async () => {
        if (auth.currentUser?.uid !== user.uid) return;
        const storageRef = ref(storage, profileAvatarPath(user.uid));
        const url = profileAvatarUrl(storageRef.bucket, user.uid);
        stage = "upload";
        const result = await uploadBytes(storageRef, blob, { contentType: blob.type, cacheControl: "public, max-age=300" });
        if (auth.currentUser?.uid !== user.uid) return;
        stage = "save_profile";
        await updateDoc(doc(firestore, "users", user.uid), { photoURL: url, profileAvatarGeneration: result.metadata.generation });
        if (auth.currentUser?.uid !== user.uid) return;
        refreshProfileAvatar(url, result.metadata.generation);
        setPhotoOverride({ uid: user.uid, url });
        showToast(t("profile.photoUpdated"));
      });
    } catch (error) {
      logClientError("PaneAccount.changeAvatar", error, { stage });
      showToast(t("profile.photoUploadFailed"));
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleRemovePhoto() {
    if (!user || user.isAnonymous || photoUploading) return;
    // 아바타 위 작은 아이콘이라 잘못 누르기 쉬워 한 번 더 묻는다
    if (!(await dialog.confirm(t("profile.photoDeleteConfirm"), { destructive: true }))) return;
    if (auth.currentUser?.uid !== user.uid) return;
    setPhotoUploading(true);
    try {
      await withPhotoLock(user.uid, async () => {
        if (auth.currentUser?.uid !== user.uid) return;
        // Clear the selected photo. The shared address can be overwritten by another device.
        await updateDoc(doc(firestore, "users", user.uid), { photoURL: null, profileAvatarGeneration: null });
        if (auth.currentUser?.uid !== user.uid) return;
        setPhotoOverride({ uid: user.uid, url: null });
        showToast(t("profile.photoRemoved"));
      });
    } catch (error) {
      logClientError("PaneAccount.removeAvatar", error, { stage: "clear_profile" });
      showToast(t("profile.photoRemoveFailed"));
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleVisibilityChange(v: Visibility) {
    if (!user || visibilityAvailability !== "ready" || visibilitySaving || bulkVisibilitySaving) return;
    setVisibilitySaving(true);
    try {
      const fn = httpsCallable<{ visibility: string }, { updated: number; scope: string }>(
        functions,
        "updateDefaultVisibility",
      );
      const result = await fn({ visibility: v });
      if (result.data.scope !== "default" || result.data.updated !== 0) {
        setVisibilityAvailability("error");
        throw new Error("Unsupported default visibility response");
      }
      showToast(t("privacy.visibilityChanged"));
    } catch {
      showToast(t("privacy.changeFailed"));
    } finally {
      setVisibilitySaving(false);
    }
  }

  async function handleApplyExistingVisibility() {
    if (!user || visibilityAvailability !== "ready" || visibilitySaving || bulkVisibilitySaving) return;
    setBulkVisibilitySaving(true);
    try {
      const preview = httpsCallable<{ visibility: Visibility; dryRun: true }, { count: number }>(functions, "applyVisibilityToExistingActivities");
      const result = await preview({ visibility: currentVisibility, dryRun: true });
      const count = result.data.count;
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid visibility preview");
      setExistingActivityCount(count);
      if (count === 0) { showToast(t("privacy.existingEmpty")); return; }
      const option = VIS_OPTS.find(option => option.value === currentVisibility)!;
      if (!await dialog.confirm(t("privacy.existingConfirm", { count, visibility: t(option.labelKey) }), { destructive: true })) return;
      const apply = httpsCallable<{ visibility: Visibility }, { updated: number }>(functions, "applyVisibilityToExistingActivities");
      const applied = await apply({ visibility: currentVisibility });
      if (!Number.isSafeInteger(applied.data.updated) || applied.data.updated < 0) throw new Error("Invalid visibility result");
      showToast(t("privacy.existingApplied", { count: applied.data.updated }));
    } catch (error) {
      logClientError("PaneAccount.applyExistingVisibility", error, {});
      showToast(t("privacy.existingFailed"));
    } finally { setBulkVisibilitySaving(false); }
  }

  async function handleToggleSetting(
    field: string,
    value: boolean,
    setter: (v: boolean) => void,
  ) {
    if (!user) return;
    setter(value);
    try {
      await updateDoc(doc(firestore, "users", user.uid), { [field]: value });
      showToast(t("privacy.settingChanged"));
    } catch {
      setter(!value);
      showToast(t("privacy.settingChangeFailed"));
    }
  }

  async function handleLogout() {
    if (!(await dialog.confirm(t("pane.account.logoutConfirm")))) return;
    await logout();
    navigate("/", { replace: true });
  }

  return (
    <>
      <div data-testid="S1-1-1"><ProfileHero
        nickname={profile?.nickname ?? ""}
        email={profile?.email}
        photoURL={photoURL}
        friendCode={friendCode}
        stravaConnected={profile?.stravaConnected}
        onEditNickname={nicknameSaving ? undefined : handleSaveNickname}
        friendCodeAction={
          <IconButton
            variant="ghost"
            icon={<Copy size={ICON_SIZE.xs} />}
            onClick={() => {
              if (friendCode) {
                void navigator.clipboard?.writeText(friendCode);
                showToast(t("profile.codeCopied"));
              }
            }}
            aria-label={t("profile.copyCode")}
            title={t("profile.copyCode")}
          />
        }
        avatarAside={photoURL && !user.isAnonymous ? (
          <IconButton
            variant="ghost"
            size="compact"
            className="settings-profile-avatar__action"
            icon={<Trash2 size={ICON_SIZE.xs} />}
            onClick={handleRemovePhoto}
            disabled={photoUploading}
            aria-label={t("profile.photoDelete")}
            title={t("profile.photoDelete")}
            style={{ color: "var(--rose)" }}
          />
        ) : undefined}
        avatarBadge={user.isAnonymous ? undefined :
          <>
            <IconButton
              variant="ghost"
              size="compact"
              className="settings-profile-avatar__action settings-profile-avatar__camera"
              icon={<Camera size={ICON_SIZE.xs} />}
              onClick={() => fileInputRef.current?.click()}
              loading={photoUploading}
              aria-label={photoUploading ? t("profile.photoUploading") : t("profile.photoChange")}
              title={photoUploading ? t("profile.photoUploading") : t("profile.photoChange")}
            />
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handlePhotoChange}
            />
          </>
        }
      /></div>

      <SettingsCard data-testid="S1-1-1" title={t("pane.account.cardProfile")}>
        <FieldGrid cols={1}>
          <Field label={t("pane.account.fieldBio")} full>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              onBlur={handleSaveBio}
              placeholder={t("pane.account.fieldBioPlaceholder")}
              disabled={bioSaving}
              style={{ ...fieldInputStyle, minHeight: 60, resize: "vertical" }}
            />
          </Field>
        </FieldGrid>
      </SettingsCard>

      <PublicDataSettingsCard />
      <NotificationPreferencesCard />

      <ProfileBodyEditor />

      <SettingsCard data-testid="S1-2-1" title={t("pane.account.cardVisibility")} dense>
        <p style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)", margin: "0 0 var(--space-3)" }}>{t("privacy.newActivityDefault")}</p>
        <div
          className="settings-visibility-options"
          style={{
            display: "grid",
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-1)',
          }}
        >
          {VIS_OPTS.map((o) => {
            const Ic = o.icon;
            const active = currentVisibility === o.value;
            return (
              <button
                type="button"
                aria-pressed={active}
                className="ds-tap-target"
                key={o.value}
                onClick={() => handleVisibilityChange(o.value)}
                disabled={visibilitySaving || bulkVisibilitySaving || visibilityAvailability !== "ready"}
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--r-md)",
                  background: active
                    ? "color-mix(in oklch, var(--lime) 8%, var(--bg-1))"
                    : "var(--bg-1)",
                  border: `1px solid ${active ? "var(--lime)" : "var(--line-soft)"}`,
                  cursor: visibilitySaving ? "wait" : "pointer",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-1-5)",
                  color: active ? "var(--ink-0)" : "var(--ink-1)",
                }}
              >
                <Ic size={ICON_SIZE.md} />
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: 500 }}>{t(o.labelKey)}</div>
              </button>
            );
          })}
        </div>
        {visibilityAvailability !== "ready" && <div role="status">
          {t("privacy.defaultSafetyUnavailable")}
        </div>}
        <InlineRow label={t("privacy.existingTitle")} hint={existingActivityCount === null ? t("privacy.existingCountOnDemand") : t("privacy.existingCount", { count: existingActivityCount })}>
          <Button data-testid="S1-2-1b" variant="secondary" onClick={() => void handleApplyExistingVisibility()}
            disabled={visibilityAvailability !== "ready" || visibilitySaving || bulkVisibilitySaving}>
            {t(bulkVisibilitySaving ? "privacy.existingApplying" : "privacy.existingApply")}
          </Button>
        </InlineRow>
        <InlineRow data-testid="S1-2-2" label={t("privacy.profilePublicInline")} hint={t("privacy.profilePublicInlineDesc")}>
          <Toggle
            on={profilePublic}
            ariaLabel={t("privacy.profilePublicInline")}
            onChange={(v) => handleToggleSetting("profilePublic", v, setProfilePublic)}
          />
        </InlineRow>
        <InlineRow data-testid="S1-2-2" label={t("privacy.leaderboard")} hint={t("privacy.leaderboardInlineDesc")}>
          <Toggle
            on={leaderboardOptIn}
            ariaLabel={t("privacy.leaderboard")}
            onChange={(v) => handleToggleSetting("leaderboardOptIn", v, setLeaderboardOptIn)}
          />
        </InlineRow>
        <InlineRow data-testid="S1-2-2" label={t("privacy.friendRequests")}>
          <Toggle
            on={friendRequestsAllowed}
            ariaLabel={t("privacy.friendRequests")}
            onChange={(v) =>
              handleToggleSetting("friendRequestsAllowed", v, setFriendRequestsAllowed)
            }
          />
        </InlineRow>
      </SettingsCard>

      <details className="settings-disclosure">
        <summary>{t("pane.account.medicalSummary")}</summary>
        <p>{t("pane.account.medicalHint")}</p>
        <PaneMedical />
      </details>
      <PaneAiCoach />


      <SocialLinksCard />

      <SettingsCard data-testid="S1-5-1" title={t("pane.account.cardManagement")} dense>
        <InlineRow label={t("pane.account.logoutLabel")} hint={t("pane.account.logoutHint")}>
          <Button variant="secondary" onClick={handleLogout}>
            {t("pane.account.logoutBtn")}
          </Button>
        </InlineRow>
        <InlineRow
          label={t("pane.account.dataLabel")}
          hint={t("pane.account.dataHint")}
        >
          <LocalizedLink to="/settings/data" className={buttonClass({ variant: "ghost", size: "sm", iconOnly: true })} aria-label={t("pane.account.manageData")} title={t("pane.account.manageData")}>
            <span className="ds-btn__icon" aria-hidden><ChevronRight size={ICON_SIZE.xs} /></span>
          </LocalizedLink>
        </InlineRow>
        <InlineRow
          label={t("pane.account.deleteLabel")}
          hint={t("pane.account.deleteHint")}
        >
          <Button variant="danger" onClick={() => navigate("/account-deletion")}>
            {t("pane.account.deleteBtnLabel")}
          </Button>
        </InlineRow>
      </SettingsCard>
    </>
  );
}
