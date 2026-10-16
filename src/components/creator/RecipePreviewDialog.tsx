import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import DOMPurify from "dompurify";
import { functions } from "../../services/firebase";
import { Button } from "../../theme/components";
import { RecipeShareCard, type RecipePublicCard } from "./RecipeShareCard";

export interface RecipePreviewRequest { recipeId: string; activityId?: string; photoId?: string | null; includePhoto?: boolean }
export interface RecipePreviewResult { subject: string; html: string; shareCard: RecipePublicCard | null }

export function privateRecipeDocument(html: string): string {
  const safe = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true, FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "a", "base", "meta", "link"], FORBID_ATTR: ["srcset"] });
  const policy = `<meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">`;
  return safe.replace(/<head>/i, `<head>${policy}`);
}

export function RecipePreviewDialog({ request, language, ownerId, onClose, onSent }: {
  request: RecipePreviewRequest; language: string; ownerId: string; onClose: () => void; onSent: () => void;
}) {
  const ko = language.startsWith("ko");
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<RecipePreviewResult | null>(null);
  const [error, setError] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [includePhoto, setIncludePhoto] = useState(request.includePhoto ?? false);
  const requestIdentity = JSON.stringify([ownerId, language, request, includePhoto]);
  const requestGeneration = useRef({ identity: requestIdentity, value: 0 });
  if (requestGeneration.current.identity !== requestIdentity) {
    requestGeneration.current = { identity: requestIdentity, value: requestGeneration.current.value + 1 };
  }
  useEffect(() => () => { requestGeneration.current.value += 1; }, []);
  useEffect(() => { setIncludePhoto(request.includePhoto ?? false); }, [request, ko, ownerId]);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let active = true;
    setResult(null); setError(false); setSent(false); setSending(false);
    void httpsCallable<RecipePreviewRequest & { lang: string }, RecipePreviewResult>(functions, "previewCreatorRecipe", { timeout: 60_000 })({ ...request, includePhoto, lang: ko ? "ko" : "en" })
      .then(({ data }) => { if (active) setResult(data); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [request, ko, ownerId, attempt, includePhoto]);
  const savePrivate = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([privateRecipeDocument(result.html)], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `orider-${request.recipeId}-private.html`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const send = async () => {
    if (sending) return;
    const generation = requestGeneration.current.value;
    const isCurrent = () => requestGeneration.current.value === generation;
    setSending(true); setError(false);
    try {
      const { data } = await httpsCallable<RecipePreviewRequest & { lang: string; deliveryMode: "manual" }, { sent: boolean }>(functions, "sendCreatorRecipeEmail", { timeout: 60_000 })({ ...request, lang: ko ? "ko" : "en", deliveryMode: "manual" });
      if (!isCurrent()) return;
      if (!data.sent) throw new Error("creator/email-not-sent");
      setSent(true); onSent();
    } catch { if (isCurrent()) setError(true); }
    finally { if (isCurrent()) setSending(false); }
  };
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="recipe-preview-title" className="fixed inset-0 m-auto max-h-[94vh] w-full max-w-6xl overflow-auto rounded-[var(--r-lg)] border p-4 backdrop:bg-black/55 md:p-6" style={{ background: "var(--bg-1)", borderColor: "var(--line)", color: "var(--ink-0)" }}>
    <div className="mb-4 flex items-start justify-between gap-4"><div><h2 id="recipe-preview-title" className="text-[length:var(--fs-xl)] font-semibold">{result?.subject ?? (ko ? "레시피 결과 미리보기" : "Recipe output preview")}</h2><p className="mt-1 text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>{ko ? "이메일 전송 없이 실제 결과를 확인합니다." : "Review the actual output before sending any email."}</p></div><Button size="sm" variant="secondary" onClick={onClose}>{ko ? "닫기" : "Close"}</Button></div>
    {request.recipeId === "ride-story" && request.photoId && <label className="mb-4 flex items-start gap-3 rounded-[var(--r-md)] border p-3 text-[length:var(--fs-sm)] leading-6" style={{ borderColor: "var(--line)", background: "var(--bg-2)" }}><input type="checkbox" checked={includePhoto} onChange={(event) => setIncludePhoto(event.target.checked)} className="mt-1" /><span>{ko ? "선택한 사진을 공개 카드와 PNG에도 포함합니다. 사진 속 인물과 배경이 공개되어도 되는지 확인했습니다." : "Include my selected photo in the public card and PNG. I have checked that the people and surroundings in this photo can be shared."}</span></label>}
    {error && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 text-[length:var(--fs-sm)]" style={{ color: "var(--rose)" }}>{ko ? "요청을 완료하지 못했습니다. 다시 시도해 주세요." : "Could not complete the request. Please retry."}{!result && <Button size="sm" variant="secondary" onClick={() => setAttempt(attempt + 1)}>{ko ? "다시 시도" : "Retry"}</Button>}</div>}
    {!result && !error && <p role="status">{ko ? "내 활동으로 결과물을 만드는 중…" : "Preparing your output…"}</p>}
    {result && <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <section className="min-w-0 space-y-3"><h3 className="font-semibold">{ko ? "비공개 리포트 · 나만 보기" : "Private report · only you"}</h3><p className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>{ko ? "개인 활동 상세가 포함될 수 있습니다. 이 파일은 공개 공유용이 아닙니다." : "May contain personal activity details. This file is for your private use."}</p><iframe title={ko ? "비공개 이메일 최종 결과" : "Final private email output"} sandbox="" referrerPolicy="no-referrer" srcDoc={privateRecipeDocument(result.html)} className="h-[65vh] w-full rounded-[var(--r-md)] border" style={{ borderColor: "var(--line)" }} /><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={savePrivate}>{ko ? "비공개 HTML 저장" : "Save private HTML"}</Button><Button size="sm" variant="primary" loading={sending} disabled={sent} onClick={() => void send()}>{sent ? (ko ? "이메일 발송 완료" : "Email sent") : (ko ? "본인 이메일로 받기" : "Email to myself")}</Button></div></section>
      <section className="min-w-0 space-y-3"><h3 className="font-semibold">{ko ? "공유용 카드 · 검토 후 공유" : "Public card · review before sharing"}</h3>{result.shareCard ? <RecipeShareCard card={result.shareCard} language={language} ready onError={() => setError(true)} /> : <p className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>{ko ? "공유 카드를 만들 활동이 없습니다. 개인 리포트에서 기록 상태를 확인하세요." : "No activity is available for a share card. Check the private report for data status."}</p>}</section>
    </div>}
  </dialog>;
}
