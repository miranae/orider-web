import { Copy } from "lucide-react";
import "./FriendsPage.css";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { useTranslation } from "react-i18next";
import { useFriends } from "../hooks/useFriends";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useDialog } from "../contexts/DialogContext";
import Avatar from "../components/Avatar";
import { Button, Card, Text, Input, buttonClass } from "../theme/components";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { buildFriendInviteUrl, shareFriendInvite } from "../utils/friendInviteShare";
import i18n from "../i18n";
import { sanitizeInternalReturnPath } from "../utils/internalReturnPath";

export default function FriendsPage() {
  const { user } = useAuth();
  const { t } = useTranslation("friends");
  const { friends, requests, sentRequests = [], readError, cancelRequest, friendCode, friendCodeLoading, loading, actionLoading, addByCode, acceptRequest, declineRequest, removeFriend } = useFriends();
  const { showToast } = useToast();
  const dialog = useDialog();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromOnboarding = searchParams.get("source") === "onboarding";
  const continueTo = sanitizeInternalReturnPath(searchParams.get("returnTo"));
  const [codeInput, setCodeInput] = useState("");
  const requestedTab = searchParams.get("tab");
  const [tab, setTab] = useState<"friends" | "requests" | "sent">(requestedTab === "requests" || requestedTab === "sent" ? requestedTab : "friends");
  useEffect(() => { if (requestedTab === "requests" || requestedTab === "sent") setTab(requestedTab); }, [requestedTab]);
  const [pendingRequests, setPendingRequests] = useState<Set<string>>(() => new Set());

  const handleShareInvite = async () => {
    if (!friendCode) return;
    const url = buildFriendInviteUrl(window.location.origin, i18n.language, friendCode);
    const result = await shareFriendInvite({ title: t("onboarding.shareTitle"), text: t("onboarding.shareText"), url });
    if (result === "copied") showToast(t("onboarding.copied"));
    else if (result === "error") showToast(t("onboarding.shareFailed"), "error");
  };

  if (!user) {
    return (
      <div className="text-center py-12 text-[var(--ink-3)]" data-testid="P3.guest">
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
        setTab("sent");
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
    const key = `accept:${requesterId}`;
    if (pendingRequests.has(key)) return;
    setPendingRequests((prev) => new Set(prev).add(key));
    try {
      await acceptRequest(requesterId);
      showToast(t("toast.acceptSuccess"));
    } catch {
      showToast(t("toast.acceptFailed"));
    } finally {
      setPendingRequests((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleDecline = async (requesterId: string) => {
    const key = `decline:${requesterId}`;
    if (pendingRequests.has(key)) return;
    setPendingRequests((prev) => new Set(prev).add(key));
    try {
      await declineRequest(requesterId);
      showToast(t("toast.declineSuccess"));
    } catch {
      showToast(t("toast.declineFailed"));
    } finally {
      setPendingRequests((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleRemove = async (friendId: string, nickname: string) => {
    if (!(await dialog.confirm(t("confirm.remove", { nickname }), { destructive: true }))) return;
    try {
      await removeFriend(friendId);
      showToast(t("toast.removeSuccess"));
    } catch {
      showToast(t("toast.removeFailed"));
    }
  };

  return (
    <div data-testid="P3-0" className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[length:var(--fs-2xl)] font-bold text-[var(--ink-0)]">{t("title")}</h1>
        <a data-testid="P3-0-2" href="#friend-invite" className={buttonClass({ variant: "secondary", size: "md" })}>{t("inviteButton")}</a>
      </div>

      {fromOnboarding && (
        <Card data-testid="P3.onboarding" padding="none" className="rounded-[var(--r-lg)] p-5">
          <Text as="h2" className="font-semibold text-[var(--ink-0)]">{t("onboarding.title")}</Text>
          <Text as="p" className="mt-1 text-[var(--ink-3)]">{t("onboarding.description")}</Text>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={handleShareInvite} disabled={friendCodeLoading || !friendCode}>
              {friendCodeLoading ? t("onboarding.loadingCode") : friendCode ? t("onboarding.share") : t("onboarding.codeUnavailable")}
            </Button>
            <Button variant="secondary" onClick={() => navigate(continueTo, { replace: true })}>{t("onboarding.continue")}</Button>
          </div>
        </Card>
      )}

      {/* Friend code + add by code */}
      <Card id="friend-invite" data-testid="P3-3" padding="none" className="rounded-[var(--r-lg)] p-5">
        {friendCode && (
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="text-[length:var(--fs-sm)] text-[var(--ink-3)]">{t("myCode")}</span>
            <Text variant="mono" className="font-semibold text-[var(--aqua)] bg-[var(--aqua)]/10 px-3 py-1 rounded-[var(--r-lg)] text-[length:var(--fs-lg)]">
              {friendCode}
            </Text>
            <Button variant="ghost" iconOnly aria-label={t("copyTooltip")} onClick={() => { void navigator.clipboard.writeText(friendCode).then(() => showToast(t("copied"))).catch(() => showToast(t("onboarding.shareFailed"), "error")); }}><Copy size={16} aria-hidden="true" /></Button>
          </div>
        )}
        <div className="flex gap-2">
          <Input
            aria-label={t("codePlaceholder")}
            type="text"
            data-testid="P3-3-1" value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleAddByCode();
              }
            }}
            placeholder={t("codePlaceholder")}
            className="flex-1 min-w-0"
          />
          <Button
            onClick={handleAddByCode}
            disabled={actionLoading || !codeInput.trim()}
            className={actionLoading ? 'cursor-wait' : undefined}
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
          </Button>
        </div>
      </Card>

      {/* Tabs */}
      <div className="friends-tabs" role="tablist" data-testid="P3-0-1" aria-label={t("tabsLabel")}>
        {(["friends", "requests", "sent"] as const).map((target) => <Button key={target} role="tab" aria-selected={tab === target} variant={tab === target ? "secondary" : "ghost"} onClick={() => setTab(target)}>{t(`tab.${target}`, {count: target === "friends" ? friends.length : target === "requests" ? requests.length : sentRequests.length})}</Button>)}
      </div>

      {readError != null && <p role="alert" data-testid="P3.error">{t("readFailed")}</p>}
      {tab === "sent" && <Card data-testid="P3-5">{sentRequests.length === 0 ? <p>{t("sentEmpty")}</p> : sentRequests.map(request => <div key={request.targetId} data-testid="P3-5-1" className="friends-sent"><Link to={`/athlete/${request.targetId}`} className="flex items-center gap-2"><Avatar name={request.nickname || t("defaultNickname")} imageUrl={request.profileImage} size="md" /><span>{request.nickname || t("defaultNickname")}<Text as="time" variant="caption" tone="secondary">{request.createdAt > 0 ? new Date(request.createdAt).toLocaleString() : "—"}</Text></span></Link><Button disabled={pendingRequests.has(`cancel:${request.targetId}`)} onClick={async () => {
        const key = `cancel:${request.targetId}`;
        if (pendingRequests.has(key)) return;
        setPendingRequests(prev => new Set(prev).add(key));
        try { if (!await dialog.confirm(t("cancelConfirm"))) return; await cancelRequest(request.targetId); showToast(t("cancelSuccess")); }
        catch { showToast(t("cancelFailed"), "error"); }
        finally { setPendingRequests(prev => { const next = new Set(prev); next.delete(key); return next; }); }
      }}>{t("cancelRequest")}</Button></div>)}</Card>}

      {/* Friend list */}
      {tab === "friends" && (
        <Card data-testid="P3-1" padding="none" className="rounded-[var(--r-lg)] overflow-hidden">
          {loading ? (
            <div data-testid="P3.loading" className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-[var(--lime)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : friends.length === 0 ? (
            <div data-testid="P3.empty" className="px-4 py-12 text-center text-[length:var(--fs-sm)] text-[var(--ink-3)]">
              {t("empty.friends")}
            </div>
          ) : (
            <div className="divide-y divide-[var(--line-soft)]">
              {friends.map((f) => (
                <div data-testid="P3-1-1" key={f.userId} className="px-4 py-3 flex items-center gap-3 hover:bg-[var(--bg-2)] transition-colors">
                  <Link to={`/athlete/${f.userId}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar name={f.nickname} imageUrl={f.profileImage} size="md" />
                    <div className="min-w-0">
                      <span className="text-[length:var(--fs-sm)] font-medium text-[var(--ink-0)] truncate block">{f.nickname}</span>
                      {f.friendCode && (
                        <span className="text-[length:var(--fs-xs)] text-[var(--ink-3)]">{f.friendCode}</span>
                      )}
                    </div>
                  </Link>
                  <Button variant="ghost" aria-label={t("removeNamed", {name: f.nickname})} onClick={() => handleRemove(f.userId, f.nickname)}>{t("remove")}</Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Friend requests */}
      {tab === "requests" && (
        <Card data-testid="P3-2" padding="none" className="rounded-[var(--r-lg)] overflow-hidden">
          {requests.length === 0 ? (
            <div className="px-4 py-12 text-center text-[length:var(--fs-sm)] text-[var(--ink-3)]">
              {t("empty.requests")}
            </div>
          ) : (
            <div className="divide-y divide-[var(--line-soft)]">
              {requests.map((r) => {
                const accepting = pendingRequests.has(`accept:${r.requesterId}`);
                const declining = pendingRequests.has(`decline:${r.requesterId}`);
                const requestPending = accepting || declining;
                return (
                  <div data-testid="P3-2-1" key={r.requesterId} className="friends-request">
                  <Link to={`/athlete/${r.requesterId}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar name={r.nickname} imageUrl={r.profileImage} size="md" />
                    <span className="text-[length:var(--fs-sm)] font-medium text-[var(--ink-0)] truncate">{r.nickname}</span>
                  </Link>
                  <div className="flex gap-2 shrink-0">
                    <Button aria-label={t("acceptNamed", {name: r.nickname})}
                      onClick={() => handleAccept(r.requesterId)}
                      disabled={requestPending}
                      className={accepting ? 'cursor-wait' : undefined}
                    >
                      {accepting ? t("accepting") : t("accept")}
                    </Button>
                    <Button variant="secondary" aria-label={t("declineNamed", {name: r.nickname})} onClick={() => handleDecline(r.requesterId)} disabled={requestPending}>{declining ? t("declining") : t("decline")}</Button>
                  </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
