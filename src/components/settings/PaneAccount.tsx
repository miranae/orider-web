import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Globe, User } from "lucide-react";
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
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import type { Visibility } from "@shared/types";
import { auth, firestore, functions, storage } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useTheme, type ThemePreference } from "../../contexts/ThemeContext";
import { useStrava } from "../../hooks/useStrava";

import { SettingsCard, FieldGrid, Field, InlineRow, Toggle, fieldInputStyle } from "./_primitives";
import { ProfileHero } from "./ProfileHero";
import { Button } from "../../theme/components";

type VisOpt = { value: Visibility; labelKey: string; icon: typeof User };

const VIS_OPTS: VisOpt[] = [
  { value: "everyone", labelKey: "privacy.visOptEveryone", icon: Globe },
  { value: "friends", labelKey: "privacy.visOptFriends", icon: User },
  { value: "private", labelKey: "privacy.visOptPrivate", icon: Eye },
];

export function PaneAccount() {
  const { t } = useTranslation("settings");
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const { theme, setTheme } = useTheme();
  const { deleteUserData, loading: stravaLoading } = useStrava();

  const [bio, setBio] = useState(profile?.bio ?? "");
  const [bioSaving, setBioSaving] = useState(false);
  const [profilePublic, setProfilePublic] = useState(profile?.profilePublic ?? true);
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(profile?.leaderboardOptIn ?? true);
  const [friendRequestsAllowed, setFriendRequestsAllowed] = useState(
    profile?.friendRequestsAllowed ?? true,
  );
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBio(profile?.bio ?? "");
    setProfilePublic(profile?.profilePublic ?? true);
    setLeaderboardOptIn(profile?.leaderboardOptIn ?? true);
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

  if (!user) return null;
  const currentVisibility: Visibility = profile?.defaultVisibility ?? "private";

  async function handleSaveNickname() {
    if (!user) return;
    const v = window.prompt(t("profile.nicknamePrompt"), profile?.nickname ?? "");
    const trimmed = v?.trim();
    if (!trimmed) return;
    try {
      await updateDoc(doc(firestore, "users", user.uid), { nickname: trimmed });
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
    }
  }

  async function handleSaveBio() {
    if (!user) return;
    setBioSaving(true);
    try {
      await updateDoc(doc(firestore, "users", user.uid), { bio });
      showToast(t("profile.bioSaved"));
    } finally {
      setBioSaving(false);
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast(t("profile.imageOnly"));
      return;
    }
    setPhotoUploading(true);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas context 실패");
      const min = Math.min(bitmap.width, bitmap.height);
      const sx = (bitmap.width - min) / 2;
      const sy = (bitmap.height - min) / 2;
      ctx.drawImage(bitmap, sx, sy, min, min, 0, 0, 512, 512);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/webp", 0.8),
      );
      const storageRef = ref(storage, `profiles/${user.uid}/avatar.webp`);
      await uploadBytes(storageRef, blob, { contentType: "image/webp" });
      const downloadURL = await getDownloadURL(storageRef);
      await updateDoc(doc(firestore, "users", user.uid), { photoURL: downloadURL });
      showToast(t("profile.photoUpdated"));
    } catch {
      showToast(t("profile.photoUploadFailed"));
    } finally {
      setPhotoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemovePhoto() {
    if (!user) return;
    try {
      await updateDoc(doc(firestore, "users", user.uid), { photoURL: null });
      showToast(t("profile.photoRemoved"));
    } catch {
      showToast(t("profile.photoRemoveFailed"));
    }
  }

  async function handleVisibilityChange(v: Visibility) {
    setVisibilitySaving(true);
    try {
      const fn = httpsCallable<{ visibility: string }, { updated: number }>(
        functions,
        "updateDefaultVisibility",
      );
      await fn({ visibility: v });
      showToast(t("privacy.visibilityChanged"));
    } catch {
      showToast(t("privacy.changeFailed"));
    } finally {
      setVisibilitySaving(false);
    }
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
    } catch {
      setter(!value);
      showToast(t("privacy.settingChangeFailed"));
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm(t("data.deleteConfirm"))) return;
    try {
      await deleteUserData();
      showToast(t("pane.account.deleteAccountDone"));
    } catch (e) {
      showToast(`${t("pane.account.deleteAccountFailed")}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleLogout() {
    if (!window.confirm(t("pane.account.logoutConfirm"))) return;
    await auth.signOut();
  }

  return (
    <>
      <ProfileHero
        nickname={profile?.nickname ?? ""}
        email={profile?.email}
        photoURL={profile?.photoURL}
        friendCode={friendCode}
        stravaConnected={profile?.stravaConnected}
        onEditNickname={handleSaveNickname}
        actions={
          <>
            <Button variant="secondary"
              onClick={() => {
                if (friendCode) {
                  void navigator.clipboard?.writeText(friendCode);
                  showToast(t("profile.codeCopied"));
                }
              }}
              disabled={!friendCode}
            >
              {t("profile.copyCode")}
            </Button>
            <Button variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoUploading}
            >
              {photoUploading ? t("profile.photoUploading") : t("profile.photoChange")}
            </Button>
            {profile?.photoURL && (
              <Button variant="ghost" onClick={handleRemovePhoto}>
                {t("profile.photoDelete")}
              </Button>
            )}
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handlePhotoChange}
            />
          </>
        }
      />

      <SettingsCard title={t("pane.account.cardProfile")}>
        <FieldGrid cols={1}>
          <Field label={t("pane.account.fieldBio")} full>
            <textarea
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

      <SettingsCard title={t("pane.account.cardVisibility")} dense>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-1)',
          }}
        >
          {VIS_OPTS.map((o) => {
            const Ic = o.icon;
            const active = currentVisibility === o.value;
            return (
              <button
                key={o.value}
                onClick={() => handleVisibilityChange(o.value)}
                disabled={visibilitySaving}
                style={{
                  padding: "14px 12px",
                  borderRadius: "var(--r-md)",
                  background: active
                    ? "color-mix(in oklch, var(--lime) 8%, var(--bg-1))"
                    : "var(--bg-1)",
                  border: `1px solid ${active ? "var(--lime)" : "var(--line-soft)"}`,
                  cursor: visibilitySaving ? "wait" : "pointer",
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-1-5)",
                  color: active ? "var(--ink-0)" : "var(--ink-1)",
                }}
              >
                <Ic size={16} />
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: 500 }}>{t(o.labelKey)}</div>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("privacy.newActivityDefault")}</div>
              </button>
            );
          })}
        </div>
        <InlineRow label={t("privacy.profilePublicInline")} hint={t("privacy.profilePublicInlineDesc")}>
          <Toggle
            on={profilePublic}
            onChange={(v) => handleToggleSetting("profilePublic", v, setProfilePublic)}
          />
        </InlineRow>
        <InlineRow label={t("privacy.leaderboard")} hint={t("privacy.leaderboardInlineDesc")}>
          <Toggle
            on={leaderboardOptIn}
            onChange={(v) => handleToggleSetting("leaderboardOptIn", v, setLeaderboardOptIn)}
          />
        </InlineRow>
        <InlineRow label={t("privacy.friendRequests")}>
          <Toggle
            on={friendRequestsAllowed}
            onChange={(v) =>
              handleToggleSetting("friendRequestsAllowed", v, setFriendRequestsAllowed)
            }
          />
        </InlineRow>
      </SettingsCard>

      <SettingsCard title={t("pane.account.cardAppearance")} dense>
        <InlineRow label={t("theme.label")} hint={t("pane.account.themeHint")}>
          <div
            style={{
              display: "flex",
              gap: 'var(--space-1)',
              padding: "var(--space-0-5)",
              background: "var(--bg-2)",
              borderRadius: "var(--r-md)",
            }}
          >
            {(
              [
                ["system", t("pane.account.themeSystem")],
                ["light", t("pane.account.themeLight")],
                ["dark", t("pane.account.themeDark")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTheme(id as ThemePreference)}
                style={{
                  padding: "6px 14px",
                  fontSize: "var(--fs-xs)",
                  fontWeight: 500,
                  borderRadius: "var(--r-sm)",
                  cursor: "pointer",
                  border: "none",
                  background: theme === id ? "var(--bg-1)" : "transparent",
                  color: theme === id ? "var(--ink-0)" : "var(--ink-3)",
                  boxShadow: theme === id ? "0 1px 3px color-mix(in srgb, var(--bg-0) 6%, transparent)" : "none",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </InlineRow>
      </SettingsCard>

      <SettingsCard title={t("pane.account.cardDanger")} danger dense>
        <InlineRow label={t("pane.account.logoutLabel")} hint={t("pane.account.logoutHint")}>
          <Button variant="secondary" onClick={handleLogout}>
            {t("pane.account.logoutBtn")}
          </Button>
        </InlineRow>
        <InlineRow
          label={t("pane.account.deleteLabel")}
          hint={t("pane.account.deleteHint")}
        >
          <Button variant="danger"
            onClick={handleDeleteAccount}
            disabled={stravaLoading}
          >
            {stravaLoading ? t("pane.account.deleteBtnDeleting") : t("pane.account.deleteBtnLabel")}
          </Button>
        </InlineRow>
      </SettingsCard>
    </>
  );
}
