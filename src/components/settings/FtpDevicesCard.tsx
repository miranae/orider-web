import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../../contexts/DialogContext";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { listActiveFtpDevices, retireFtpRegistration, type FtpRegistration } from "../../services/ftpDeviceRegistrations";
import { logClientError } from "../../services/errorLogger";
import { Button, Stack } from "../../theme/components";
import { SettingsCard } from "./_primitives";

export function FtpDevicesCard({ uid, names }: { uid: string; names: ReadonlyMap<string, string> }) {
  const { t, i18n } = useTranslation("settings");
  const services = useFirebaseServices();
  const dialog = useDialog();
  const [devices, setDevices] = useState<FtpRegistration[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function load() {
    const viewer = services.auth?.currentUser;
    setBusy(true);
    setError(false);
    try {
      setDevices(await listActiveFtpDevices(services, uid));
    } catch (cause) {
      logClientError("FtpDevicesCard.list", cause, {}, services, viewer);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function retire(device: FtpRegistration, name: string) {
    const viewer = services.auth?.currentUser;
    setBusy(true);
    setError(false);
    try {
      if (await dialog.confirm(t("device.ftpRetireConfirm", { name }), { destructive: true })) {
        await retireFtpRegistration(services, uid, device.id);
        setDevices((current) => current?.filter((item) => item.id !== device.id) ?? null);
      }
    } catch (cause) {
      logClientError("FtpDevicesCard.retire", cause, {}, services, viewer);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return <SettingsCard title={t("device.ftpRegistrations")} action={
    <Button size="sm" disabled={busy} onClick={() => void load()}>{t(devices ? "device.reload" : "device.ftpList")}</Button>
  }>
    {error && <p role="alert">{t("device.ftpRequestFailed")}</p>}
    {devices?.length === 0 && <p>{t("device.ftpNone")}</p>}
    <Stack>{devices?.map((device) => {
      const name = names.get(device.id) || device.platform || device.id;
      return <Stack key={device.id} direction="row" align="center" justify="space-between" wrap>
        <div>
          <strong>{name}</strong> {device.id !== name && <small>{device.id}</small>}
          {device.lastSeenAt > 0 && <div>{t("device.ftpLastSeen", { date: new Date(device.lastSeenAt).toLocaleString(i18n.language) })}</div>}
        </div>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void retire(device, name)}>{t("device.ftpRetire")}</Button>
      </Stack>;
    })}</Stack>
  </SettingsCard>;
}
