import "./fitness-analysis-controls.css";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { DropdownSelect, Button, Chip, IconButton, Text } from "../../../theme/components";
import { RefreshCw } from "lucide-react";
import { ICON_SIZE } from "../../../theme/tokens/icon";
import type { RiderWorkoutType } from "../../../services/riderWorkoutDeliveryContract";
import { useRiderWorkoutDelivery } from "../useRiderWorkoutDelivery";
import { getRuntimeConfig } from "../../../services/runtimeConfig";
import { FOCUS_TARGETS, thresholdSettingsHref } from "../../../services/focusTarget";
import { useInPlaceSignIn } from "../../../hooks/useInPlaceSignIn";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { Resolvable, type Resolve } from "../../../components/redesign/states/Resolvable";
import type { RiderWorkoutDeliveryErrorKind } from "../../../services/riderWorkoutDeliveryClient";

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
  const { login } = useInPlaceSignIn();
  // 앱 안 임베드 화면은 앱이 로그인을 맡으므로 문구를 눌러 웹 로그인을 열지 않는다.
  const signInResolve: Resolve | undefined = useFirebaseServices().scope !== "embedded" ? { onClick: () => void login() } : undefined;
  // 실패 문구 자체를 누르면 그 실패를 푸는 곳으로 간다. 제자리 버튼(새 요청 준비)은 그대로 둔다.
  const errorResolve: Partial<Record<RiderWorkoutDeliveryErrorKind, Resolve | undefined>> = {
    ftp_required: { to: thresholdSettingsHref("bike", FOCUS_TARGETS.ftp) },
    device_reconnect: { to: "/settings/device" },
    auth: signInResolve,
  };
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  if (!uid) return <Text as="p" variant="caption" tone="warning"><Resolvable resolve={signInResolve}>{t("coach.delivery.login")}</Resolvable></Text>;
  if (controller.devicesLoading) return <Text as="p" variant="caption" tone="tertiary">{t("coach.delivery.devicesLoading")}</Text>;
  if (controller.devicesError) return <Text as="p" variant="caption" tone="warning"><Resolvable resolve={{ onClick: controller.retryDevices }}>{t("coach.delivery.devicesError")}</Resolvable></Text>;
  if (controller.devices.length === 0) return <><Text as="p" variant="caption" tone="tertiary"><Resolvable resolve={{ to: "/settings/device" }}>{t("coach.delivery.noDevices")}</Resolvable></Text>{explicitWorkoutLabel && <LocalizedLink data-testid="K2-3-6" to="/settings/device">{t("today.noDeviceLink")}</LocalizedLink>}</>;

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
          {/* 같은 요청 다시 확인은 오류 문구 옆 아이콘 — 전체 폭 버튼으로 늘리지 않는다. */}
          <div className="fitness-coach__delivery-error-message">
            <Text as="p" variant="caption" tone="warning">
              <Resolvable resolve={controller.submitErrorKind ? errorResolve[controller.submitErrorKind] : undefined}>{t(`coach.delivery.error.${controller.submitErrorKind ?? "unknown"}`)}</Resolvable>
            </Text>
            {controller.canSafelyReplay && (
              <IconButton size="sm" variant="outline" icon={<RefreshCw size={ICON_SIZE.sm} />} disabled={busy}
                aria-label={t("coach.delivery.retry")} title={t("coach.delivery.retry")} onClick={() => void controller.submit()} />
            )}
          </div>
          {!controller.canSafelyReplay && controller.submitErrorKind && (
            <Button variant="outline" size="sm" className="fitness-coach__delivery-error-action" disabled={busy} data-testid={explicitWorkoutLabel ? "K2-3-5" : undefined} onClick={controller.prepareNewRequest}>
              {t(controller.submitErrorKind === "cooldown" ? "coach.delivery.prepareAfterCooldown" : "coach.delivery.prepareNew")}
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
