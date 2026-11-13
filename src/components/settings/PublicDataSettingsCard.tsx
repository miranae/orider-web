import { useEffect, useState } from "react";
import { doc, getDocFromServer, setDoc } from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { SettingsCard, InlineRow, Toggle } from "./_primitives";
import { Button } from "../../theme/components";

export const PUBLIC_DATA_FIELDS = [
  { key: "heartRate", label: "심박", defaultPublic: true },
  { key: "power", label: "파워", defaultPublic: true },
  { key: "training", label: "훈련 지표 (TSS·IF)", defaultPublic: true },
  { key: "cadence", label: "케이던스", defaultPublic: true },
  { key: "calories", label: "칼로리", defaultPublic: true },
  { key: "thresholds", label: "내 기준값 (FTP·최대 심박 설정·LTHR)", defaultPublic: false },
] as const;

export function PublicDataSettingsCard() {
  const { user } = useAuth();
  const uid = user && !user.isAnonymous ? user.uid : null;
  const [state, setState] = useState<{ owner: string | null; values: Record<string, boolean>; ready: boolean }>({ owner: null, values: {}, ready: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      if (current) setError("공개 데이터 설정을 불러오지 못했습니다.");
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
      setError("공개 데이터 설정을 저장하지 못했습니다.");
    } finally { setSaving(false); }
  }
  return <SettingsCard title="공개 데이터">
    <p>활동을 볼 수 있는 사람에게 공개할 항목입니다. 끄면 기존 활동에도 적용됩니다.</p>
    {PUBLIC_DATA_FIELDS.map(field => <InlineRow key={field.key} label={field.label}>
      <Toggle ariaLabel={field.label} on={state.values[field.key] ?? field.defaultPublic} disabled={!ready || saving} onChange={value => void save(field.key, value)} />
    </InlineRow>)}
    {error && <div role="alert">{error}<Button onClick={() => setReload(n => n + 1)}>다시 시도</Button></div>}
  </SettingsCard>;
}
