import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { doc, getDocFromServer, setDoc } from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { SettingsCard, InlineRow, Toggle } from "./_primitives";
import { Button } from "../../theme/components";

export const PUBLIC_DATA_FIELDS = [
  { key: "heartRate", labelKey: "publicData.heartRate", defaultPublic: true },
  { key: "power", labelKey: "publicData.power", defaultPublic: true },
  { key: "training", labelKey: "publicData.training", defaultPublic: true },
  { key: "cadence", labelKey: "publicData.cadence", defaultPublic: true },
  { key: "calories", labelKey: "publicData.calories", defaultPublic: true },
  { key: "thresholds", labelKey: "publicData.thresholds", defaultPublic: false },
] as const;

export function PublicDataSettingsCard() {
  const { t } = useTranslation("settings");
  const { user } = useAuth();
  const uid = user && !user.isAnonymous ? user.uid : null;
  const [state, setState] = useState<{ owner: string | null; values: Record<string, boolean>; ready: boolean }>({ owner: null, values: {}, ready: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<"loadFailed" | "saveFailed" | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    setState({ owner: uid, values: {}, ready: false });
    setError(null);
    if (uid) void getDocFromServer(doc(firestore, "users", uid, "private", "public_data_settings")).then(snap => {
      if (current) {
        const data = snap.data() ?? {};
        const values = Object.fromEntries(PUBLIC_DATA_FIELDS.filter(f => Object.prototype.hasOwnProperty.call(data, f.key)).map(f => [f.key, data[f.key] === true]));
        setState({ owner: uid, values, ready: true });
      }
    }).catch(reason => {
      logClientError("PublicDataSettings.load", reason);
      if (current) setError("loadFailed");
    });
    return () => { current = false; };
  }, [uid, reload]);
  if (!uid) return null;
  const ready = state.owner === uid && state.ready;
  async function save(key: string, value: boolean) {
    if (!ready || saving || !uid) return;
    setSaving(true);
    try {
      await setDoc(doc(firestore, "users", uid, "private", "public_data_settings"), { [key]: value }, { merge: true });
      setState(previous => previous.owner === uid ? { ...previous, values: { ...previous.values, [key]: value } } : previous);
      setError(null);
    } catch (reason) {
      logClientError("PublicDataSettings.save", reason, { field: key });
      setError("saveFailed");
    } finally { setSaving(false); }
  }
  return <SettingsCard title={t("publicData.title")}>
    <p>{t("publicData.description")}</p>
    {PUBLIC_DATA_FIELDS.map(field => <InlineRow key={field.key} label={t(field.labelKey)}>
      <Toggle ariaLabel={t(field.labelKey)} on={state.values[field.key] ?? field.defaultPublic} disabled={!ready || saving} onChange={value => void save(field.key, value)} />
    </InlineRow>)}
    {error && <div role="alert">{t(`publicData.${error}`)}<Button onClick={() => setReload(n => n + 1)}>{t("publicData.retry")}</Button></div>}
  </SettingsCard>;
}
