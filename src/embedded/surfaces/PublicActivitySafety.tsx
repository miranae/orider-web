import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { createPublicActivityClient } from "../../services/publicActivityDetail";
import { isPublicActivityAccessError } from "../../services/publicActivityDetail";
import { Button, Stack, Text, Textarea } from "../../theme/components";

type Action = "report" | "hide" | "block";
interface Props {
  activityId: string;
  authorId: string;
  client: ReturnType<typeof createPublicActivityClient>;
  onRemoved: (action: "hide" | "block") => void;
  onAccessRevoked: () => void;
}

/** The parent keys this editor by viewer/activity; late writes cannot affect another account. */
export default function PublicActivitySafety({ activityId, authorId, client, onRemoved, onAccessRevoked }: Props) {
  const { t } = useTranslation("activity");
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reported, setReported] = useState(false);
  const pending = useRef(false);
  const alive = useRef(true);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (action) (action === "report" ? editor.current : cancel.current)?.focus(); }, [action]);
  useEffect(() => { if (!action && !busy) trigger.current?.focus(); }, [action, busy]);
  const close = () => {
    if (pending.current) return;
    setAction(null); setNote(""); setFailed(false); trigger.current?.focus();
  };
  const submit = async () => {
    if (!action || pending.current) return;
    pending.current = true; setBusy(true); setFailed(false);
    try {
      if (action === "report") await client.reportActivity(activityId, note.trim());
      else if (action === "hide") await client.hideActivity(activityId);
      else await client.blockAuthor(authorId);
      if (!alive.current) return;
      if (action === "report") { setReported(true); setAction(null); setNote(""); trigger.current?.focus(); }
      else onRemoved(action);
    } catch (error) {
      if (!alive.current) return;
      if (isPublicActivityAccessError(error)) onAccessRevoked();
      else setFailed(true);
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return <Stack gap="var(--space-3)">
    <Stack direction="row" wrap gap="var(--space-2)">
      {(["report", "hide", "block"] as const).map(item => <Button key={item} variant="ghost" disabled={busy}
        onClick={event => { trigger.current = event.currentTarget; setAction(item); setFailed(false); setReported(false); }}>
        {t(`publicSafety.${item}`)}
      </Button>)}
    </Stack>
    {action && <div role="group" aria-label={t(`publicSafety.${action}`)} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
    }}>
      <Stack gap="var(--space-3)">
        <Text>{t(`publicSafety.${action}Confirm`)}</Text>
        {action === "report" && <label><Text>{t("publicSafety.note")}</Text><Textarea ref={editor}
          value={note} maxLength={1000} disabled={busy} onChange={event => setNote(event.target.value)} /></label>}
        <Stack direction="row" gap="var(--space-2)">
          <Button ref={cancel} variant="outline" disabled={busy} onClick={close}>{t("publicSafety.cancel")}</Button>
          <Button variant="danger" loading={busy} onClick={() => void submit()}>{t("publicSafety.confirm")}</Button>
        </Stack>
        {failed && <Text role="alert">{t("publicSafety.failed")}</Text>}
      </Stack>
    </div>}
    {reported && <Text role="status">{t("publicSafety.reported")}</Text>}
  </Stack>;
}
