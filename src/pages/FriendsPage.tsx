import { useState } from "react";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { useTranslation } from "react-i18next";
import { useFriends } from "../hooks/useFriends";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import Avatar from "../components/Avatar";
import { Card, Text } from "../theme/components";

export default function FriendsPage() {
  const { user } = useAuth();
  const { t } = useTranslation("friends");
  const { friends, requests, friendCode, loading, actionLoading, addByCode, acceptRequest, declineRequest, removeFriend } = useFriends();
  const { showToast } = useToast();
  const [codeInput, setCodeInput] = useState("");
  const [tab, setTab] = useState<"friends" | "requests">("friends");

  if (!user) {
    return (
      <div className="text-center py-12 text-[var(--ink-3)]">
        {t("loginRequired")}
      </div>
    );
  }

  const handleAddByCode = async () => {
    const code = codeInput.trim();
    if (!code) return;
    try {
      const result = await addByCode(code);
      if (result?.alreadyFriends) {
        showToast(t("toast.alreadyFriends"));
      } else if (result?.success) {
        showToast(t("toast.added", { nickname: result.friendNickname || t("defaultNickname") }));
      }
      setCodeInput("");
    } catch (err: any) {
      const code: string = err?.code ?? "";
      if (code.includes("not-found")) {
        showToast(t("toast.notFound"));
      } else if (code.includes("invalid-argument")) {
        showToast(t("toast.cannotAddSelf"));
      } else {
        showToast(err?.message || t("toast.addFailed"));
      }
    }
  };

  const handleAccept = async (requesterId: string) => {
    try {
      await acceptRequest(requesterId);
      showToast(t("toast.acceptSuccess"));
    } catch {
      showToast(t("toast.acceptFailed"));
    }
  };

  const handleDecline = async (requesterId: string) => {
    try {
      await declineRequest(requesterId);
      showToast(t("toast.declineSuccess"));
    } catch {
      showToast(t("toast.declineFailed"));
    }
  };

  const handleRemove = async (friendId: string, nickname: string) => {
    if (!window.confirm(t("confirm.remove", { nickname }))) return;
    try {
      await removeFriend(friendId);
      showToast(t("toast.removeSuccess"));
    } catch {
      showToast(t("toast.removeFailed"));
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-[length:var(--fs-2xl)] font-bold text-[var(--ink-0)]">{t("title")}</h1>

      {/* Friend code + add by code */}
      <Card padding="none" className="rounded-[var(--r-lg)] p-5">
        {friendCode && (
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[length:var(--fs-sm)] text-[var(--ink-3)]">{t("myCode")}</span>
            <Text variant="mono" className="font-semibold text-[var(--aqua)] bg-[var(--aqua)]/10 px-3 py-1 rounded-[var(--r-lg)] text-[length:var(--fs-lg)]">
              {friendCode}
            </Text>
            <button
              onClick={() => { navigator.clipboard.writeText(friendCode); showToast(t("copied")); }}
              className="text-[var(--ink-3)] hover:text-[var(--lime)] transition-colors"
              title={t("copyTooltip")}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleAddByCode();
              }
            }}
            placeholder={t("codePlaceholder")}
            className="flex-1 px-4 py-2 text-[length:var(--fs-sm)] rounded-[var(--r-lg)] focus:outline-none focus:border-[var(--lime)]"
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--ink-1)' }}
          />
          <button
            onClick={handleAddByCode}
            disabled={actionLoading || !codeInput.trim()}
            className={`ds-btn ds-btn--md px-5 py-2 text-[length:var(--fs-sm)] font-medium rounded-[var(--r-lg)] disabled:opacity-50${actionLoading ? 'cursor-wait' : ''}`}
          >
            {actionLoading ? (
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t("adding")}
              </span>
            ) : t("addButton")}
          </button>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--line-soft)]">
        <button
          onClick={() => setTab("friends")}
          className={`px-4 py-2.5 text-[length:var(--fs-sm)] font-medium border-b-2 transition-colors ${
            tab === "friends"
              ? "border-[var(--lime)] text-[var(--lime)]"
              : "border-transparent text-[var(--ink-3)] hover:text-[var(--ink-1)]"
          }`}
        >
          {t("tab.friends", { count: friends.length })}
        </button>
        <button
          onClick={() => setTab("requests")}
          className={`px-4 py-2.5 text-[length:var(--fs-sm)] font-medium border-b-2 transition-colors relative ${
            tab === "requests"
              ? "border-[var(--lime)] text-[var(--lime)]"
              : "border-transparent text-[var(--ink-3)] hover:text-[var(--ink-1)]"
          }`}
        >
          {t("tab.requests", { count: requests.length })}
          {requests.length > 0 && tab !== "requests" && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-[var(--lime)] rounded-full text-[10px] font-bold text-[var(--bg-0)] flex items-center justify-center">
              {requests.length}
            </span>
          )}
        </button>
      </div>

      {/* Friend list */}
      {tab === "friends" && (
        <Card padding="none" className="rounded-[var(--r-lg)] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-[var(--lime)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : friends.length === 0 ? (
            <div className="px-4 py-12 text-center text-[length:var(--fs-sm)] text-[var(--ink-3)]">
              {t("empty.friends")}
            </div>
          ) : (
            <div className="divide-y divide-[var(--line-soft)]">
              {friends.map((f) => (
                <div key={f.userId} className="px-4 py-3 flex items-center gap-3 hover:bg-[var(--bg-2)] transition-colors">
                  <Link to={`/athlete/${f.userId}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar name={f.nickname} imageUrl={f.profileImage} size="md" />
                    <div className="min-w-0">
                      <span className="text-[length:var(--fs-sm)] font-medium text-[var(--ink-0)] truncate block">{f.nickname}</span>
                      {f.friendCode && (
                        <span className="text-[length:var(--fs-xs)] text-[var(--ink-3)]">{f.friendCode}</span>
                      )}
                    </div>
                  </Link>
                  <button
                    onClick={() => handleRemove(f.userId, f.nickname)}
                    className="text-[length:var(--fs-xs)] text-[var(--ink-3)] hover:text-[var(--rose)] transition-colors shrink-0 px-2 py-1"
                  >
                    {t("remove")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Friend requests */}
      {tab === "requests" && (
        <Card padding="none" className="rounded-[var(--r-lg)] overflow-hidden">
          {requests.length === 0 ? (
            <div className="px-4 py-12 text-center text-[length:var(--fs-sm)] text-[var(--ink-3)]">
              {t("empty.requests")}
            </div>
          ) : (
            <div className="divide-y divide-[var(--line-soft)]">
              {requests.map((r) => (
                <div key={r.requesterId} className="px-4 py-3 flex items-center gap-3">
                  <Link to={`/athlete/${r.requesterId}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar name={r.nickname} imageUrl={r.profileImage} size="md" />
                    <span className="text-[length:var(--fs-sm)] font-medium text-[var(--ink-0)] truncate">{r.nickname}</span>
                  </Link>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleAccept(r.requesterId)}
                      disabled={actionLoading}
                      className={`ds-btn ds-btn--md px-3 py-1.5 text-[length:var(--fs-xs)] font-medium rounded-[var(--r-lg)] disabled:opacity-50${actionLoading ? 'cursor-wait' : ''}`}
                    >
                      {actionLoading ? t("accepting") : t("accept")}
                    </button>
                    <button
                      onClick={() => handleDecline(r.requesterId)}
                      disabled={actionLoading}
                      className={`px-3 py-1.5 text-[length:var(--fs-xs)] font-medium rounded-[var(--r-lg)] text-[var(--ink-1)] hover:bg-[var(--bg-3)] transition-colors disabled:opacity-50 ${actionLoading ? 'cursor-wait' : ''}`}
                      style={{ background: 'var(--bg-2)', border: '1px solid var(--line-soft)' }}
                    >
                      {actionLoading ? t("declining") : t("decline")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
