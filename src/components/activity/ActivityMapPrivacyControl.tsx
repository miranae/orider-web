import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { createActivityMapPrivacyClient, type ActivityMapPrivacy } from "../../services/activityMapPrivacy";
import { Button, Card, Field, IconButton, Input, Stack, Text } from "../../theme/components";
import { ICON_SIZE } from "../../theme/tokens/icon";
import RouteMap from "../RouteMap";
import ActivityMapThumbnailReplaceControl from "./ActivityMapThumbnailReplaceControl";

type Thumbnail = { polyline: string; contentRevision?: unknown; contentSelectedRevision?: unknown };

/**
 * 공개 지도 보호 설정 상태. 여는 버튼(지도 왼쪽 아래 연필)과 설정 패널(지도 아래)이 화면의 다른 자리에 있어
 * 상태는 hook 으로 두고 두 조각이 함께 쓴다.
 */
export function useActivityMapPrivacy(activityId: string) {
  const { user } = useAuth(); const services = useFirebaseServices();
  const client = useMemo(() => createActivityMapPrivacyClient(services), [services, user]);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ client: typeof client; activityId: string; current: ActivityMapPrivacy; preview: ActivityMapPrivacy | null } | null>(null);
  const [start, setStart] = useState("0"), [end, setEnd] = useState("0");
  const [error, setError] = useState<"failed" | "conflict" | null>(null), [saved, setSaved] = useState(false);
  const generation = useRef(0), pending = useRef(false), input = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const focusEditor = useRef(false);
  const current = state?.client === client && state.activityId === activityId ? state : null;
  useEffect(() => { generation.current++; pending.current = false; focusEditor.current = false; setState(null); setOpen(false); setBusy(false); setError(null); setSaved(false); return () => { generation.current++; }; }, [client, activityId]);
  useEffect(() => { if (focusEditor.current && open && !busy && current) { focusEditor.current = false; input.current?.focus(); } });
  const valid = start !== "" && end !== "" && [Number(start), Number(end)].every(value => Number.isInteger(value) && value >= 0 && value <= 5000);
  async function run(kind: "load" | "preview" | "save") {
    if (pending.current || kind !== "load" && (!current || !valid)) return;
    pending.current = true; setBusy(true); setError(null); setSaved(false);
    const request = generation.current;
    try {
      const settings = { startMeters: Number(start), endMeters: Number(end) };
      const value = kind === "load" ? await client.load(activityId) : kind === "preview" ? await client.preview(activityId, settings, current!.current.revision) : await client.save(activityId, settings, current!.current.revision);
      if (request !== generation.current) return;
      if (kind === "preview") setState({ client, activityId, current: current!.current, preview: value });
      else { focusEditor.current = kind === "load"; setState({ client, activityId, current: value, preview: null }); setStart(String(value.settings.startMeters)); setEnd(String(value.settings.endMeters)); setOpen(true); setSaved(kind === "save" && !value.revocationPending); }
    } catch (reason) {
      if (request !== generation.current) return;
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String(reason.code) : "";
      setError(code.endsWith("aborted") ? "conflict" : "failed");
      setState(null);
    } finally { if (request === generation.current) { pending.current = false; setBusy(false); } }
  }
  function edit(value: string, field: "start" | "end") { (field === "start" ? setStart : setEnd)(value); setSaved(false); if (current) setState({ ...current, preview: null }); }
  const close = () => { setOpen(false); setState(null); trigger.current?.focus(); };
  return { activityId, open, busy, current, start, end, valid, error, saved, input, trigger, run, edit, close };
}
export type ActivityMapPrivacyState = ReturnType<typeof useActivityMapPrivacy>;

/** 지도 왼쪽 아래 모서리에 얹는 연필 버튼(지도 크기 조절 버튼과 같은 모양). */
export function ActivityMapPrivacyTrigger({ control, className }: { control: ActivityMapPrivacyState; className?: string }) {
  const { t } = useTranslation("activity");
  return <IconButton ref={control.trigger} variant="ghost" size="sm" className={className} loading={control.busy} aria-expanded={control.open}
    aria-label={t("mapPrivacy.title")} title={t("mapPrivacy.title")} icon={<Pencil size={ICON_SIZE.sm} />} onClick={() => void control.run("load")} />;
}

/** 연필을 눌렀을 때만 펼쳐지는 설정 패널. 닫혀 있으면 자리를 차지하지 않는다. */
export function ActivityMapPrivacyPanel({ control, thumbnail }: { control: ActivityMapPrivacyState; thumbnail?: Thumbnail }) {
  const { t } = useTranslation("activity");
  const { activityId, open, busy, current, start, end, valid, error, saved, input, run, edit, close } = control;
  if (!(open && current) && !error && !saved) return null;
  const displayed = current?.preview ?? current?.current;
  return <Card><Stack gap="var(--space-3)">
    {open && current && <>
      <Text as="h2" variant="bodyMedium" weight={600}>{t("mapPrivacy.title")}</Text>
      <Text>{t("mapPrivacy.current", { ...current.current.settings })}</Text>
      <Text variant="bodySmall">{t(`mapPrivacy.visibility.${current.current.visibility}`)}</Text>
      <Text variant="bodySmall">{t("mapPrivacy.explanation")}</Text>
      {current.current.revocationPending && <Text role="alert">{t("mapPrivacy.revocationPending")}</Text>}
      <Field label={t("mapPrivacy.start")} htmlFor={`map-start-${activityId}`}><Input ref={input} id={`map-start-${activityId}`} type="number" min={0} max={5000} step={1} value={start} disabled={busy} invalid={!valid} onChange={event => edit(event.target.value, "start")} /></Field>
      <Field label={t("mapPrivacy.end")} htmlFor={`map-end-${activityId}`}><Input id={`map-end-${activityId}`} type="number" min={0} max={5000} step={1} value={end} disabled={busy} invalid={!valid} onChange={event => edit(event.target.value, "end")} /></Field>
      <Text role="status">{t(current.preview ? "mapPrivacy.unsaved" : "mapPrivacy.published")}</Text>
      {displayed?.state === "available" && displayed.mapPreview.encodedPolyline
        ? <RouteMap polyline={displayed.mapPreview.encodedPolyline} interactive={false} height="aspect-video" />
        : displayed?.state === "available" && displayed.mapPreview.imageUrl ? <img src={displayed.mapPreview.imageUrl} alt={t("mapPrivacy.published")} loading="lazy" />
        : <Text role="status">{t(`mapPrivacy.${displayed?.state === "available" ? "no_gps" : displayed?.state ?? "no_gps"}`)}</Text>}
      <Stack direction="row" wrap gap="var(--space-2)">
        <Button variant="secondary" disabled={!valid || busy} loading={busy} onClick={() => void run("preview")}>{t("mapPrivacy.preview")}</Button>
        <Button disabled={!current.preview || busy || !valid || current.preview.state === "changed_source"} loading={busy} onClick={() => void run("save")}>{t("mapPrivacy.save")}</Button>
        <Button variant="ghost" disabled={busy} onClick={close}>{t("kudosCard.cancel")}</Button>
      </Stack>
      <Text variant="caption">{t("mapPrivacy.limit")}</Text>
      {/* 보호가 켜진 활동은 썸네일이 없어(imageUrl=null) 다시 만들기 버튼도 숨는다. */}
      {current.current.mapPreview.imageUrl && thumbnail?.polyline && <ActivityMapThumbnailReplaceControl activityId={activityId} {...thumbnail} />}
    </>}
    {error && <><Text role="alert">{t(`mapPrivacy.${error}`)}</Text><Stack direction="row" wrap><Button size="sm" variant="secondary" onClick={() => void run("load")} disabled={busy}>{t("page.retry")}</Button></Stack></>}
    {saved && <Text role="status">{t("mapPrivacy.saved")}</Text>}
  </Stack></Card>;
}

export default function ActivityMapPrivacyControl({ activityId, thumbnail }: { activityId: string; thumbnail?: Thumbnail }) {
  const control = useActivityMapPrivacy(activityId);
  return <Stack gap="var(--space-3)"><div><ActivityMapPrivacyTrigger control={control} /></div><ActivityMapPrivacyPanel control={control} thumbnail={thumbnail} /></Stack>;
}
