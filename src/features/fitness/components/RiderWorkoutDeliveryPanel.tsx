import "./fitness-analysis-controls.css";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { DropdownSelect, Button, Chip, Text, buttonClass } from "../../../theme/components";
import type { RiderWorkoutType } from "../../../services/riderWorkoutDeliveryContract";
import { useRiderWorkoutDelivery } from "../useRiderWorkoutDelivery";
import { getRuntimeConfig } from "../../../services/runtimeConfig";
import { FOCUS_TARGETS, thresholdSettingsHref } from "../../../services/focusTarget";
import { useInPlaceSignIn } from "../../../hooks/useInPlaceSignIn";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";

interface RiderWorkoutDeliveryPanelProps {
  uid: string | null;
  workoutType: RiderWorkoutType;
  targetTss: 20 | 45;
  explicitWorkoutLabel?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

function duration(minutes: number, language: string): string {
  return language.startsWith("ko") ? `${minutes}분` : `${minutes} min`;
}

function EnabledRiderWorkoutDeliveryPanel({ uid, workoutType, targetTss, onBusyChange, explicitWorkoutLabel = false }: RiderWorkoutDeliveryPanelProps) {
  const { t, i18n } = useTranslation("fitness");
  const controller = useRiderWorkoutDelivery(uid, workoutType);
  const selectedDevice = controller.devices.find((device) => device.deviceId === controller.targetDeviceId);
  const state = controller.deliveryState;
  const busy = controller.submitState === "submitting";
  const { login, pending: loginPending } = useInPlaceSignIn();
  // 앱 안 임베드 화면은 앱이 로그인을 맡으므로 웹 로그인 버튼을 띄우지 않는다.
  const canSignInHere = useFirebaseServices().scope !== "embedded";
  const errorKind = controller.submitErrorKind;
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  const signInButton = canSignInHere && (
    <Button variant="outline" block loading={loginPending} onClick={() => void login()}>{t("coach.delivery.signIn")}</Button>
  );
  if (!uid) return <><Text as="p" variant="caption" tone="warning">{t("coach.delivery.login")}</Text>{signInButton}</>;
  if (controller.devicesLoading) return <Text as="p" variant="caption" tone="tertiary">{t("coach.delivery.devicesLoading")}</Text>;
  if (controller.devicesError) return <><Text as="p" variant="caption" tone="warning">{t("coach.delivery.devicesError")}</Text><Button variant="outline" block onClick={controller.retryDevices}>{t("coach.delivery.retryDevices")}</Button></>;
  if (controller.devices.length === 0) return <><Text as="p" variant="caption" tone="tertiary">{t("coach.delivery.noDevices")}</Text><LocalizedLink data-testid="K2-3-6" to="/settings/device">{t("today.noDeviceLink")}</LocalizedLink></>;

  return (
    <div className="fitness-analysis-controls fitness-coach__handoff">
      <div data-testid={explicitWorkoutLabel ? "K2-3-2" : undefined} className="fitness-coach__delivery-preview">
        <Text as="div" variant="label">{t(`coach.choice.${workoutType}.bike`)}</Text>
        <Text as="div" variant="caption" tone="secondary">{t("coach.delivery.preflight", { tss: targetTss })}</Text>
      </div>
      <label className="fitness-coach__device-select">
        <Text as="span" variant="bodyMedium">{t("coach.delivery.target")}</Text>
        <div data-testid={explicitWorkoutLabel ? "K2-3-1" : undefined}><DropdownSelect disabled={busy} label={t("coach.delivery.target")} value={String(controller.targetDeviceId)} onChange={next => controller.setTargetDeviceId(next)} options={controller.devices.map((device) => ({ value: String(device.deviceId), label: `${device.deviceName || t("coach.delivery.deviceFallback")} · ${device.appVersion ? t("coach.delivery.appVersion", { version: device.appVersion }) : device.platform || device.deviceId}` }))} /></div>
      </label>
      <Text as="p" variant="caption" tone="tertiary">{t("coach.delivery.deviceHelp")}</Text>
      {controller.restoreLoading && <Text as="p" variant="caption" tone="tertiary">{t("coach.delivery.restoring")}</Text>}
      {controller.canCreate && !controller.submitError && (
        <Button data-testid={explicitWorkoutLabel ? "K2-3-3" : undefined} variant="primary" block disabled={busy || !selectedDevice || controller.restoreLoading} onClick={() => void controller.submit()}>
          {busy ? t("coach.delivery.requesting") : state ? t("coach.delivery.requestNew") : explicitWorkoutLabel ? t("today.sendSimpleWorkout", { workout: t(`coach.choice.${workoutType}.bike`), tss: targetTss }) : t("coach.delivery.request")}
        </Button>
      )}
      {state && (
        <div data-testid={explicitWorkoutLabel ? "K2-3-4" : undefined} className="fitness-coach__delivery-status" role="status" aria-live="polite">
          <Chip variant={state === "failed" || state === "superseded" || state === "expired" ? "warning" : state === "completed" ? "success" : "accent"} dot>
            {t(`coach.delivery.state.${state}`)}
          </Chip>
          <Text as="p" variant="caption" tone="secondary">
            {t(`coach.delivery.stateHelp.${state}`, { device: selectedDevice?.deviceName || t("coach.delivery.deviceFallback") })}
          </Text>
        </div>
      )}
      {controller.delivery?.bundle && (
        <div className="fitness-coach__bundle">
          <div className="fitness-coach__bundle-heading">
            <Text as="div" variant="label">{t("coach.delivery.bundleTitle")}</Text>
            <Text as="div" variant="caption" tone="tertiary">
              {t("coach.delivery.bundleMeta", { ftp: controller.delivery.bundle.ftpW, tss: controller.delivery.bundle.targetTss })}
            </Text>
          </div>
          <ol>
            {controller.delivery.bundle.steps.map((step, index) => (
              <li key={`${step.label}-${index}`}>
                <Text as="span" variant="label">{t(`coach.delivery.step.${step.label}`)}</Text>
                <Text as="span" variant="caption" tone="secondary">
                  {duration(Math.round(step.durationSec / 60), i18n.language)} · {step.targetPowerMinW}–{step.targetPowerMaxW} W
                </Text>
              </li>
            ))}
          </ol>
          <Text as="p" variant="caption" tone="tertiary">{t("coach.delivery.serverAuthority")}</Text>
        </div>
      )}
      {controller.submitError && (
        <div className="fitness-coach__delivery-error" role="alert">
          <Text as="p" variant="caption" tone="warning">{t(`coach.delivery.error.${errorKind ?? "unknown"}`)}</Text>
          {/* 다른 화면에서 풀리는 실패는 그 화면으로 바로 잇는다. 새 요청 준비 버튼은 그대로 둔다. */}
          {errorKind === "ftp_required" && (
            <LocalizedLink className={buttonClass({ variant: "secondary", block: true })} to={thresholdSettingsHref("bike", FOCUS_TARGETS.ftp)}>{t("coach.delivery.openFtpSettings")}</LocalizedLink>
          )}
          {errorKind === "device_reconnect" && (
            <LocalizedLink className={buttonClass({ variant: "secondary", block: true })} to="/settings/device">{t("coach.delivery.openDeviceSettings")}</LocalizedLink>
          )}
          {errorKind === "auth" && signInButton}
          {controller.canSafelyReplay && (
            <Button variant="outline" block disabled={busy} onClick={() => void controller.submit()}>
              {t("coach.delivery.retry")}
            </Button>
          )}
          {!controller.canSafelyReplay && errorKind && (
            <Button variant="outline" block disabled={busy} data-testid={explicitWorkoutLabel ? "K2-3-5" : undefined} onClick={controller.prepareNewRequest}>
              {t(errorKind === "cooldown" ? "coach.delivery.prepareAfterCooldown" : "coach.delivery.prepareNew")}
            </Button>
          )}
        </div>
      )}
      <Text as="p" variant="caption" tone="tertiary">{t("coach.delivery.serverRevalidation")}</Text>
    </div>
  );
}

export default function RiderWorkoutDeliveryPanel(props: RiderWorkoutDeliveryPanelProps) {
  const { t } = useTranslation("fitness");
  if (getRuntimeConfig().riderWorkoutDeliveryEnabled !== true) {
    return <Text as="p" variant="caption" tone="tertiary">{t("coach.delivery.featurePreparing")}</Text>;
  }
  return <EnabledRiderWorkoutDeliveryPanel {...props} />;
}
