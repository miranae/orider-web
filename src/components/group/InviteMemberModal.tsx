import { Button, Text, Input } from "../../theme/components";
import { useAuth } from "../../contexts/AuthContext";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { httpsCallable } from "firebase/functions";
import { auth, ensureAppCheckReady, functions } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { searchPublicUserProfilesByNickname, type PublicUserProfile } from "../../services/publicProfiles";
import Avatar from "../Avatar";
import Modal from "../Modal";
import { buildGroupInviteUrl } from "../../features/group/groupInviteLink";

interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  inviteCode: string;
  inviteStatus: string;
  onRetry: () => void;
}

interface SearchResult {
  id: string;
  profile: PublicUserProfile;
}

export default function InviteMemberModal({ open, onClose, groupId, inviteCode, inviteStatus, onRetry }: InviteMemberModalProps) {
  const { user } = useAuth();
  const uid = user?.uid;
  const searchId = useId();
  const { t, i18n } = useTranslation("group");
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  const [feedback, setFeedback] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const context = useRef(0);
  const searchRequest = useRef(0);

  useEffect(() => {
    context.current += 1;
    searchRequest.current += 1;
    setSearchQuery("");
    setResults([]);
    setSearching(false);
    setInviting(null);
    setCopied(false);
    setInvitedIds(new Set());
    setFeedback(null);
    setSearched(false);
    return () => { context.current += 1; };
  }, [groupId, open, uid]);

  const handleSearch = async () => {
    if (!uid || auth.currentUser?.uid !== uid || !searchQuery.trim()) return;
    const currentContext = context.current;
    const request = ++searchRequest.current;
    setFeedback(null);
    setSearching(true);
    setSearched(false);
    try {
      const profiles = await searchPublicUserProfilesByNickname(searchQuery, 10);
      if (currentContext !== context.current || request !== searchRequest.current || auth.currentUser?.uid !== uid) return;
      setSearched(true);
      setResults(profiles.map((profile) => ({ id: profile.id, profile })));
    } catch (err) {
      if (currentContext !== context.current || request !== searchRequest.current || auth.currentUser?.uid !== uid) return;
      logClientError("InviteMemberModal.handleSearch", err, { groupId });
      setResults([]);
      setFeedback("invite.searchFailed");
    } finally {
      if (currentContext === context.current && request === searchRequest.current) setSearching(false);
    }
  };

  const handleInvite = async (targetUserId: string) => {
    if (!uid || auth.currentUser?.uid !== uid || inviting !== null) return;
    const currentContext = context.current;
    const current = () => currentContext === context.current && auth.currentUser?.uid === uid;
    setFeedback(null);
    setInviting(targetUserId);
    try {
      await ensureAppCheckReady();
      if (!current()) return;
      const inviteFn = httpsCallable(functions, "inviteToGroup");
      await inviteFn({ groupId, targetUserId });
      if (!current()) return;
      setInvitedIds((prev) => new Set(prev).add(targetUserId));
    } catch (err) {
      logClientError("InviteMemberModal.handleInvite", err, { groupId, targetUserId });
      if (current()) setFeedback("invite.inviteFailed");
    }
    if (current()) setInviting(null);
  };

  const handleCopy = async () => {
    if (!inviteCode) return;
    const currentContext = context.current;
    setFeedback(null);
    try {
      if (!navigator.clipboard?.writeText) { setFeedback("invite.copyFailed"); return; }
      await navigator.clipboard.writeText(buildGroupInviteUrl(inviteCode, i18n.language));
      if (currentContext !== context.current) return;
      setCopied(true);
      setTimeout(() => { if (currentContext === context.current) setCopied(false); }, 2000);
    } catch (err) {
      logClientError("InviteMemberModal.handleCopy", err, { groupId });
      if (currentContext === context.current) setFeedback("invite.copyFailed");
    }
  };

  return (
    <Modal accessible open={open} onClose={onClose} title={t("invite.modalTitle")}>
      <div className="mb-6">
        <Text as="h3" variant="subtitle" className="mb-3">{t("members.inviteLink")}</Text>
        {inviteStatus === "failed" ? <div className="club-invite-load-error" role="alert"><Text as="p" variant="body">{t("invite.linkLoadFailed")}</Text><Button variant="secondary" size="sm" onClick={onRetry}>{t("invite.retry")}</Button></div> : inviteCode ? <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 px-3 py-2 rounded-[var(--r-md)] text-[length:var(--ft-body-medium-size)] font-mono" style={{background:"var(--bg-1)",color:"var(--ink-0)",wordBreak:"break-all"}}>{buildGroupInviteUrl(inviteCode,i18n.language)}</code>
          <Button variant="secondary" size="sm" onClick={handleCopy}>{copied ? t("invite.copied") : t("button.copy")}</Button>
        </div> : <Text as="p" variant="body" role="status">{t(`invite.${inviteStatus}`)}</Text>}
      </div>

      <div>
        <label htmlFor={searchId} className="block text-[length:var(--ft-body-medium-size)] font-medium mb-2" style={{color:"var(--ink-1)"}}>{t("invite.searchPlaceholder")}</label>
        <div className="flex gap-2 mb-3">
          <Input id={searchId}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder={t("invite.searchPlaceholder")}
            className="min-w-0 flex-1 px-3 py-2 rounded-[var(--r-md)] text-[length:var(--ft-body-medium-size)] focus:ring-2 focus:ring-[var(--lime)] focus:border-[var(--lime)] border"
            style={{ borderColor: "var(--line-soft)", background: "var(--bg-0)", color: "var(--ink-0)" }}
          />
          <Button variant="primary"
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="px-3 py-2 text-[length:var(--ft-body-medium-size)] font-medium rounded-[var(--r-md)] bg-[var(--lime)] text-[var(--bg-0)] hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {t("invite.searchButton")}
          </Button>
        </div>
        {feedback && <p role="alert" className="text-[length:var(--ft-body-medium-size)] mb-3" style={{ color: "var(--color-error)" }}>{t(feedback)}</p>}
        {searched && results.length === 0 && <p role="status" className="text-[length:var(--ft-body-medium-size)]">{t("invite.searchEmpty")}</p>}
        {results.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-2">
            {results.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-2 rounded-[var(--r-md)] hover:bg-[var(--bg-1)]">
                <div className="flex items-center gap-2">
                  <Avatar name={r.profile.nickname} imageUrl={r.profile.photoURL} size="sm" />
                  <span className="text-[length:var(--ft-body-medium-size)]" style={{ color: "var(--ink-0)" }}>{r.profile.nickname}</span>
                </div>
                {invitedIds.has(r.id) ? (
                  <span className="text-[length:var(--fs-xs)] text-green-500">{t("invite.invitedStatus")}</span>
                ) : (
                  <Button variant="primary"
                    onClick={() => handleInvite(r.id)}
                    disabled={inviting !== null}
                    className="px-3 py-1 text-[length:var(--fs-xs)] font-medium rounded-[var(--r-md)] bg-[var(--lime)] text-[var(--bg-0)] hover:opacity-90 disabled:opacity-50 transition-colors"
                  >
                    {inviting === r.id ? "..." : t("invite.inviteButton")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end mt-6">
        <Button variant="secondary" onClick={onClose} className="px-4 py-2 text-[length:var(--ft-body-medium-size)]" style={{ color: "var(--ink-2)" }}>
          {t("invite.close")}
        </Button>
      </div>
    </Modal>
  );
}
