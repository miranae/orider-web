import { standaloneText } from "../../i18n/standaloneText";
import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import DOMPurify from "dompurify";
import { creatorRecipeErrorFeedback, type CreatorRecipeErrorFeedback } from "../../utils/creatorRecipeErrors";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { Button } from "../../theme/components";
import { RecipeShareCard, type RecipePublicCard } from "./RecipeShareCard";
import { Resolvable } from "../redesign/states/Resolvable";

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
  const { functions } = useFirebaseServices();
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<RecipePreviewResult | null>(null);
  const [error, setError] = useState<CreatorRecipeErrorFeedback | null>(null);
  const [retryNow, setRetryNow] = useState(Date.now);
  const genericError = (): CreatorRecipeErrorFeedback => ({ message: standaloneText(language, "recipe_preview_could_not_complete_the_request_please"), retryable: true, retryAt: null });
  useEffect(() => {
    const wait = (error?.retryAt ?? 0) - Date.now();
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setRetryNow(Date.now()), Math.min(wait, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [error]);
  const retryWaiting = Boolean(error?.retryAt && error.retryAt > retryNow);
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
    setResult(null); setError(null); setSent(false); setSending(false);
    void httpsCallable<RecipePreviewRequest & { lang: string }, RecipePreviewResult>(functions, "previewCreatorRecipe", { timeout: 60_000 })({ ...request, includePhoto, lang: ko ? "ko" : "en" })
      .then(({ data }) => { if (active) setResult(data); })
      .catch((failure) => { if (active) { setRetryNow(Date.now()); setError(creatorRecipeErrorFeedback(failure, language) ?? genericError()); } });
    return () => { active = false; };
  }, [request, ko, language, ownerId, attempt, includePhoto, functions]);
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
    setSending(true); setError(null);
    try {
      const { data } = await httpsCallable<RecipePreviewRequest & { lang: string; deliveryMode: "manual" }, { sent: boolean }>(functions, "sendCreatorRecipeEmail", { timeout: 60_000 })({ ...request, lang: ko ? "ko" : "en", deliveryMode: "manual" });
      if (!isCurrent()) return;
      if (!data.sent) throw new Error("creator/email-not-sent");
      setSent(true); onSent();
    } catch (failure) { if (isCurrent()) { setRetryNow(Date.now()); setError(creatorRecipeErrorFeedback(failure, language, "email") ?? genericError()); } }
    finally { if (isCurrent()) setSending(false); }
  };
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="recipe-preview-title" className="fixed inset-0 m-auto max-h-[94vh] w-full max-w-6xl overflow-auto rounded-[var(--r-lg)] border p-4 backdrop:bg-black/55 md:p-6" style={{ background: "var(--bg-1)", borderColor: "var(--line)", color: "var(--ink-0)" }}>
    <div className="mb-4 flex items-start justify-between gap-4"><div><h2 id="recipe-preview-title" className="text-[length:var(--fs-xl)] font-semibold">{result?.subject ?? (standaloneText(language, "recipe_preview_recipe_output_preview"))}</h2><p className="mt-1 text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>{standaloneText(language, "recipe_preview_review_the_actual_output_before_sending")}</p></div><Button size="sm" variant="secondary" onClick={onClose}>{standaloneText(language, "recipe_preview_close")}</Button></div>
    {request.recipeId === "ride-story" && request.photoId && <label className="mb-4 flex items-start gap-3 rounded-[var(--r-md)] border p-3 text-[length:var(--fs-sm)] leading-6" style={{ borderColor: "var(--line)", background: "var(--bg-2)" }}><input type="checkbox" checked={includePhoto} onChange={(event) => setIncludePhoto(event.target.checked)} className="mt-1" /><span>{standaloneText(language, "recipe_preview_include_my_selected_photo_in_the")}</span></label>}
    {error && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 text-[length:var(--fs-sm)]" style={{ color: "var(--rose)" }}><Resolvable resolve={error.resolveTo ? { to: error.resolveTo } : undefined}>{error.message}</Resolvable>{!result && error.retryable && <Button size="sm" variant="secondary" disabled={retryWaiting} onClick={() => setAttempt(attempt + 1)}>{standaloneText(language, "recipe_preview_retry")}</Button>}</div>}
    {!result && !error && <p role="status">{standaloneText(language, "recipe_preview_preparing_your_output")}</p>}
    {result && <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <section className="min-w-0 space-y-3"><h3 className="font-semibold">{standaloneText(language, "recipe_preview_private_report_only_you")}</h3><p className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>{standaloneText(language, "recipe_preview_may_contain_personal_activity_details_this")}</p><iframe title={standaloneText(language, "recipe_preview_final_private_email_output")} sandbox="" referrerPolicy="no-referrer" srcDoc={privateRecipeDocument(result.html)} className="h-[65vh] w-full rounded-[var(--r-md)] border" style={{ borderColor: "var(--line)" }} /><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={savePrivate}>{standaloneText(language, "recipe_preview_save_private_html")}</Button><Button size="sm" variant="primary" loading={sending} disabled={sent || error?.retryable === false || retryWaiting} onClick={() => void send()}>{sent ? (standaloneText(language, "recipe_preview_email_sent")) : (standaloneText(language, "recipe_preview_email_to_myself"))}</Button></div></section>
      <section className="min-w-0 space-y-3"><h3 className="font-semibold">{standaloneText(language, "recipe_preview_public_card_review_before_sharing")}</h3>{result.shareCard ? <RecipeShareCard card={result.shareCard} language={language} ready onError={() => setError(genericError())} /> : <p className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>{standaloneText(language, "recipe_preview_no_activity_is_available_for_a")}</p>}</section>
    </div>}
  </dialog>;
}
