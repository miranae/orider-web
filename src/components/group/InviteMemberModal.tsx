import { useState } from "react";
import { useTranslation } from "react-i18next";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import Avatar from "../Avatar";
import Modal from "../Modal";
import type { UserProfile } from "@shared/types";

interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  inviteCode: string;
}

interface SearchResult {
  id: string;
  profile: UserProfile;
}

export default function InviteMemberModal({ open, onClose, groupId, inviteCode }: InviteMemberModalProps) {
  const { t } = useTranslation("group");
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const q = query(
        collection(firestore, "users"),
        where("nickname", ">=", searchQuery.trim()),
        where("nickname", "<=", searchQuery.trim() + "\uf8ff"),
        limit(10),
      );
      const snap = await getDocs(q);
      setResults(snap.docs.map((d) => ({ id: d.id, profile: d.data() as UserProfile })));
    } catch {
      setResults([]);
    }
    setSearching(false);
  };

  const handleInvite = async (targetUserId: string) => {
    setInviting(targetUserId);
    try {
      const inviteFn = httpsCallable(functions, "inviteToGroup");
      await inviteFn({ groupId, targetUserId });
      setInvitedIds((prev) => new Set(prev).add(targetUserId));
    } catch (err) {
      logClientError("InviteMemberModal.handleInvite", err, { groupId, targetUserId });
    }
    setInviting(null);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal open={open} onClose={onClose} title={t("invite.modalTitle")}>
      <div className="mb-6">
        <label className="block text-[length:var(--fs-sm)] font-medium mb-2" style={{ color: "var(--ink-1)" }}>{t("members.inviteCode")}</label>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 rounded-[var(--r-md)] text-[length:var(--fs-sm)] font-mono" style={{ background: "var(--bg-1)", color: "var(--ink-0)" }}>
            {inviteCode}
          </code>
          <button
            onClick={handleCopy}
            className="px-3 py-2 text-[length:var(--fs-sm)] font-medium rounded-[var(--r-md)] transition-colors" style={{ background: "var(--bg-2)", color: "var(--ink-1)" }}
          >
            {copied ? t("invite.copied") : t("button.copy")}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-[length:var(--fs-sm)] font-medium mb-2" style={{ color: "var(--ink-1)" }}>{t("invite.directLabel")}</label>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder={t("invite.searchPlaceholder")}
            className="flex-1 px-3 py-2 rounded-[var(--r-md)] text-[length:var(--fs-sm)] focus:ring-2 focus:ring-[var(--lime)] focus:border-[var(--lime)] border"
            style={{ borderColor: "var(--line-soft)", background: "var(--bg-0)", color: "var(--ink-0)" }}
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-3 py-2 text-[length:var(--fs-sm)] font-medium rounded-[var(--r-md)] bg-[var(--lime)] text-[var(--bg-0)] hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {t("invite.searchButton")}
          </button>
        </div>
        {results.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-2">
            {results.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-2 rounded-[var(--r-md)] hover:bg-[var(--bg-1)]">
                <div className="flex items-center gap-2">
                  <Avatar name={r.profile.nickname} imageUrl={r.profile.photoURL} size="sm" />
                  <span className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-0)" }}>{r.profile.nickname}</span>
                </div>
                {invitedIds.has(r.id) ? (
                  <span className="text-[length:var(--fs-xs)] text-green-500">{t("invite.invitedStatus")}</span>
                ) : (
                  <button
                    onClick={() => handleInvite(r.id)}
                    disabled={inviting === r.id}
                    className="px-3 py-1 text-[length:var(--fs-xs)] font-medium rounded-[var(--r-md)] bg-[var(--lime)] text-[var(--bg-0)] hover:opacity-90 disabled:opacity-50 transition-colors"
                  >
                    {inviting === r.id ? "..." : t("invite.inviteButton")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end mt-6">
        <button onClick={onClose} className="px-4 py-2 text-[length:var(--fs-sm)]" style={{ color: "var(--ink-2)" }}>
          {t("invite.close")}
        </button>
      </div>
    </Modal>
  );
}
