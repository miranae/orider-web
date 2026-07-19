import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button, Text } from "../../theme/components";
import type { CoachConsentPolicy } from "../../services/coachConsentClient";
import { CoachPolicyDisclosure } from "./CoachPolicyDisclosure";
import "./coach-consent.css";

interface Props {
  open: boolean;
  stale?: boolean;
  saving: boolean;
  error?: string | null;
  policy: CoachConsentPolicy;
  onCancel: () => void;
  onConsented: () => void;
}

export function CoachConsentSheet({ open, stale, saving, error, policy, onCancel, onConsented }: Props) {
  const { t } = useTranslation("settings");
  const panelRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const savingRef = useRef(saving);
  const onCancelRef = useRef(onCancel);
  useEffect(() => { savingRef.current = saving; }, [saving]);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const portalRoot = panel?.parentElement;
    const hiddenSiblings = Array.from(document.body.children)
      .filter((element) => element !== portalRoot)
      .map((element) => ({
        element: element as HTMLElement,
        ariaHidden: element.getAttribute("aria-hidden"),
        inert: (element as HTMLElement & { inert?: boolean }).inert ?? false,
      }));
    hiddenSiblings.forEach(({ element }) => {
      element.setAttribute("aria-hidden", "true");
      (element as HTMLElement & { inert?: boolean }).inert = true;
    });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (savingRef.current) panel?.focus(); else cancelRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) onCancelRef.current();
      if (event.key === "Tab" && panel) {
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter((element) => !element.hasAttribute("hidden")
          && !(element.tagName !== "SUMMARY" && element.closest("details:not([open])")));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (focusable.length === 0) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      hiddenSiblings.forEach(({ element, ariaHidden, inert }) => {
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
        (element as HTMLElement & { inert?: boolean }).inert = inert;
      });
      previousFocus.current?.focus();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="app-dialog coach-consent-dialog" role="presentation">
      <button
        type="button"
        className="app-dialog__backdrop"
        tabIndex={-1}
        aria-hidden="true"
        disabled={saving}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onCancel}
      />
      <section ref={panelRef} tabIndex={-1} className="app-dialog__panel coach-consent-sheet" role="dialog" aria-modal="true" aria-labelledby="coach-consent-title" aria-describedby="coach-consent-summary">
        <header className="coach-consent-sheet__header">
          <Text id="coach-consent-title" as="h2" variant="title">{t(stale ? "coach.staleTitle" : "coach.consentTitle")}</Text>
          <Text id="coach-consent-summary" as="p" variant="bodySmall" tone="secondary">{t("coach.compactIntro")}</Text>
        </header>
        <div className="coach-consent-sheet__body">
          <CoachPolicyDisclosure policy={policy} stale={stale} mode="compact" />
          <Text as="p" variant="bodySmall" tone="secondary">{t("coach.conversationContextNote")}</Text>
          <Text as="p" variant="bodySmall" tone="secondary">{t("coach.consentPersistenceNote")}</Text>
          {error && <Text as="p" variant="bodySmall" tone="danger" role="alert">{t("coach.saveFailed")}</Text>}
        </div>
        <div className="app-dialog__actions coach-consent-sheet__actions">
          <Button ref={cancelRef} type="button" variant="secondary" disabled={saving} onClick={onCancel}>{t("coach.cancel")}</Button>
          <Button type="button" variant="primary" disabled={saving} onClick={onConsented}>
            {saving ? t("coach.saving") : t("coach.acceptAndAsk")}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
