import FirebaseSessionBoundary from "../../contexts/FirebaseSessionBoundary";
import { useEffect, useRef, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useTranslation } from "react-i18next";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { useDialog } from "../../contexts/DialogContext";
import { getPublicUserProfiles } from "../../services/publicProfiles";
import { Button, Card } from "../../theme/components";
import { Resolvable } from "../redesign/states/Resolvable";
import { normalizeStartTime } from "../../utils/event-time";
import { logClientError } from "../../services/errorLogger";
import { FOCUS_TARGET_ATTR, clubRequestFocusKey, focusTargetProps, revealFocusTarget } from "../../services/focusTarget";
import { debugLog } from "../../services/errorLogger";

interface RequestRow { id: string; userId: string; groupId: string; name: string; status: string; requestedAt: number; resolvedAt: number }
/** 「승인 대기」를 눌렀을 때 보여 줄 신청 — nonce 가 바뀔 때마다 한 번 찾아 초점을 둔다. */
export type PendingRequestFocus = { groupId: string; nonce: number };
type GroupRequestHistoryProps = { userId?: string; groupId?: string; sectionId?: string; focusRequest?: PendingRequestFocus | null; /** 휴대폰 목록의 「가입 신청」 행에서 열었으면 기록을 펼친 채로 보인다. */ defaultOpen?: boolean; /** 휴대폰 목록: 카드 대신 「가입 신청 · N건」 행을 펼침 제목으로 쓴다. 기록이 하나도 없으면 행도 숨긴다. */ row?: { label: string; count?: string } };
export default function GroupRequestHistory(props: GroupRequestHistoryProps) {
  return <FirebaseSessionBoundary><GroupRequestHistoryContent {...props} /></FirebaseSessionBoundary>;
}

function GroupRequestHistoryContent({ userId, groupId, sectionId, focusRequest, defaultOpen, row }: GroupRequestHistoryProps) {
  const { t, i18n } = useTranslation("group");
  const dialog = useDialog();
  const { auth, ensureAppCheckReady, firestore, functions } = useFirebaseServices();
  const [latestRows, setRows] = useState<RequestRow[]>([]);
  // 최신 10개 밖의 승인 대기 신청 — 「승인 대기」를 눌렀을 때만 그 한 건을 따로 읽어 붙인다.
  const [extraRows, setExtraRows] = useState<RequestRow[]>([]);
  const rows = [...latestRows, ...extraRows.filter(extra => !latestRows.some(row => row.id === extra.id))];
  const [error, setError] = useState(false);
  // 불러오기 실패 문구를 누르면 다시 구독한다(시작할 때 오류를 지워 조회 중엔 문구가 없다).
  const [readAttempt, setReadAttempt] = useState(0);
  const [actionErrors, setActionErrors] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const intent = useRef(0);
  useEffect(() => {
    const scope = ++intent.current;
    let version = 0;
    setRows([]); setExtraRows([]); setLookupGroupId(null); setError(false); setBusy(null); setActionErrors({});
    if (!userId && !groupId) return;
    const ref = groupId ? collection(firestore, "groups", groupId, "joinRequests") : collection(firestore, "users", userId!, "group_requests");
    const unsubscribe = onSnapshot(query(ref, orderBy("requestedAt", "desc"), limit(10)), snapshot => {
      const nextVersion = ++version;
      setError(false);
      const nextRows = snapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, userId: String(data.userId ?? ""), groupId: String(data.groupId ?? groupId ?? ""), name: String(data.groupName ?? data.nickname ?? data.userId ?? ""), status: String(data.status ?? "pending"), requestedAt: normalizeStartTime(data.requestedAt), resolvedAt: normalizeStartTime(data.resolvedAt) };
      });
      setRows(nextRows);
      if (groupId && nextRows.length) void getPublicUserProfiles(nextRows.map(row => row.userId), firestore).then(profiles => {
        if (intent.current !== scope || version !== nextVersion) return;
        setRows(nextRows.map(row => ({ ...row, name: profiles.get(row.userId)?.nickname || row.name })));
      }).catch(err => { logClientError("GroupRequestHistory.profiles", err); });
    }, err => { if (intent.current === scope) { setError(true); setRows([]); } logClientError("GroupRequestHistory.read", err); });
    return () => { intent.current += 1; unsubscribe(); };
  }, [userId, groupId, firestore, readAttempt]);
  // 「승인 대기」 → 그 신청의 「신청 취소」에 초점. 최신 10개 밖이면 그 클럽의 승인 대기 신청만 구독해 붙인 뒤 초점을 둔다.
  // 일회성 읽기가 아니라 구독이라, 다른 탭의 취소나 운영진 승인·거절로 대기가 끝나면 그 행도 바로 빠진다.
  const handledFocus = useRef<number | null>(null);
  const [lookupGroupId, setLookupGroupId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusRequest || groupId || !userId || handledFocus.current === focusRequest.nonce) return;
    const target = document.querySelector<HTMLElement>(`[${FOCUS_TARGET_ATTR}="${clubRequestFocusKey(focusRequest.groupId)}"]`);
    if (target) {
      handledFocus.current = focusRequest.nonce;
      debugLog("club-pending-request", { groupId: focusRequest.groupId, focused: revealFocusTarget(target) });
      return;
    }
    // 아직 그려지지 않았으면 다음 렌더에서 다시 시도한다. 최신 기록에도 없으면 그 한 건을 구독한다.
    if (rows.some(row => row.groupId === focusRequest.groupId && row.status === "pending")) return;
    if (lookupGroupId !== focusRequest.groupId) setLookupGroupId(focusRequest.groupId);
  });
  useEffect(() => {
    setExtraRows([]);
    if (!lookupGroupId || !userId || groupId) return;
    const scope = intent.current;
    const ref = collection(firestore, "users", userId, "group_requests");
    return onSnapshot(query(ref, where("groupId", "==", lookupGroupId), where("status", "==", "pending"), limit(1)), snapshot => {
      if (intent.current !== scope) return;
      debugLog("club-pending-request", { groupId: lookupGroupId, source: "lookup", found: snapshot.docs.length });
      setExtraRows(snapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, userId: String(data.userId ?? ""), groupId: String(data.groupId ?? ""), name: String(data.groupName ?? data.userId ?? ""), status: "pending", requestedAt: normalizeStartTime(data.requestedAt), resolvedAt: 0 };
      }));
    }, err => { logClientError("GroupRequestHistory.pendingLookup", err, { groupId: lookupGroupId }); });
  }, [lookupGroupId, userId, groupId, firestore]);
  if (!rows.length && !error) return null;
  const entries = <>{error ? <p role="alert"><Resolvable resolve={{ onClick: () => setReadAttempt(n => n + 1) }}>{t("error.loadFailed")}</Resolvable></p> : rows.map(row => <div key={row.id} className="space-y-2"><div className="flex items-center justify-between gap-3"><span>{row.name} · {t(`requests.${row.status}`)} · {row.requestedAt ? new Date(row.requestedAt).toLocaleString(i18n.language) : "–"}{row.resolvedAt ? ` → ${new Date(row.resolvedAt).toLocaleString(i18n.language)}` : ""}</span>{!groupId && row.status === "pending" && <Button data-testid="C0-1-3-cancel" {...focusTargetProps(clubRequestFocusKey(row.groupId))} size="sm" disabled={busy !== null} onClick={async () => {
    if (!userId || busy || auth.currentUser?.uid !== userId) return;
    const scope = intent.current;
    if (!(await dialog.confirm(t("requests.cancelConfirm"), { destructive: true }))) return;
    if (intent.current !== scope || auth.currentUser?.uid !== userId) return;
    setBusy(row.id); setActionErrors(prev => ({ ...prev, [row.id]: false }));
    try {
      await ensureAppCheckReady();
      if (intent.current !== scope || auth.currentUser?.uid !== userId) return;
      await httpsCallable(functions, "cancelGroupRequest")({ groupId: row.groupId });
    } catch (err) { if (intent.current === scope) setActionErrors(prev => ({ ...prev, [row.id]: true })); logClientError("GroupRequestHistory.cancel", err); }
    finally { if (intent.current === scope) setBusy(null); }
  }}>{t("requests.cancel")}</Button>}</div>{actionErrors[row.id] && <p role="alert">{t("requests.cancelFailed")}</p>}</div>)}</>;
  if (row) return <details data-testid="C0-1-3" className="club-m-details" open={defaultOpen || undefined}>
    <summary data-testid="C0-1-4" className="club-m-row club-m-row--button"><span>{row.label}</span>{row.count && <span className="club-m-row__count">{row.count}</span>}</summary>
    <div className="club-m-panel">{entries}</div>
  </details>;
  const history = <Card data-testid={groupId ? "C7-1-2" : "C0-1-3"} className="space-y-3"><details open={defaultOpen || undefined}><summary>{t("requests.history")}</summary>{entries}</details></Card>;
  return sectionId ? <section data-testid={sectionId}>{history}</section> : history;
}
