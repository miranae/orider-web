import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  cropDisplayScale,
  cropMaxZoom,
  cropRegion,
  initialCropState,
  panCrop,
  zoomCrop,
  type ProfileAvatarCrop,
  type ProfileAvatarCropState,
} from "@shared/profileAvatarCrop";
import Modal from "../Modal";
import { Button, Field, Text } from "../../theme/components";

/** 방향을 반영해 디코딩한 사진. 화면에 그린 픽셀과 잘라 올릴 픽셀이 같은 좌표계가 되도록 하나를 함께 쓴다. */
export type CropImage = CanvasImageSource & { width: number; height: number };

interface ProfileAvatarCropDialogProps {
  image: CropImage;
  onCancel: () => void;
  onConfirm: (region: ProfileAvatarCrop) => void;
}

const KEY_PAN_STEP = 16;
const KEY_ZOOM_STEP = 1.1;
// 사진 위 어둡게 덮는 막과 원형 안내선 — 테마와 무관하게 사진 위에 그린다.
const SCRIM = "rgba(0, 0, 0, 0.55)";
const GUIDE = "rgba(255, 255, 255, 0.9)";

/** 고른 사진에서 프로필로 쓸 정사각 영역을 고른다(#1827). 규칙은 앱과 같은 `@shared/profileAvatarCrop`. */
export function ProfileAvatarCropDialog({ image, onCancel, onConfirm }: ProfileAvatarCropDialogProps) {
  const { t } = useTranslation("settings");
  const { width, height } = image;
  const [state, setState] = useState<ProfileAvatarCropState>(
    () => initialCropState(width, height) ?? { zoom: 1, centerX: 0, centerY: 0 },
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const hintId = useId();
  const zoomId = useId();
  const maxZoom = cropMaxZoom(width, height);

  const viewSide = () => stageRef.current?.clientWidth ?? 0;
  const pan = (dx: number, dy: number) =>
    setState(s => panCrop(width, height, s, dx, dy, viewSide()) ?? s);
  const zoom = (factor: number) => setState(s => zoomCrop(width, height, s, factor) ?? s);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const draw = () => {
      const side = stage.clientWidth;
      const scale = cropDisplayScale(width, height, state, side);
      const ctx = canvas.getContext("2d");
      if (!ctx || scale == null) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(side * ratio);
      canvas.height = Math.round(side * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, side, side);
      ctx.drawImage(image, side / 2 - state.centerX * scale, side / 2 - state.centerY * scale, width * scale, height * scale);
      ctx.beginPath();
      ctx.rect(0, 0, side, side);
      ctx.arc(side / 2, side / 2, side / 2, 0, Math.PI * 2);
      ctx.fillStyle = SCRIM;
      ctx.fill("evenodd");
      ctx.beginPath();
      ctx.arc(side / 2, side / 2, side / 2 - 1, 0, Math.PI * 2);
      ctx.strokeStyle = GUIDE;
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    draw();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(draw);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [image, width, height, state]);

  // 휠·트랙패드 핀치(ctrl+wheel)는 페이지 스크롤을 막아야 해서 passive 가 아닌 리스너로 받는다.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const factor = Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.002));
      setState(s => zoomCrop(width, height, s, factor) ?? s);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [width, height]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const active = pointers.current;
    const previous = active.get(event.pointerId);
    if (!previous) return;
    const [a0, b0] = [...active.values()];
    active.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const [a1, b1] = [...active.values()];
    if (!a0 || !b0 || !a1 || !b1) {
      pan(event.clientX - previous.x, event.clientY - previous.y);
      return;
    }
    // 두 손가락: 거리 비율로 확대하고 가운데점이 움직인 만큼 옮긴다.
    const before = Math.hypot(a0.x - b0.x, a0.y - b0.y);
    if (before > 0) zoom(Math.hypot(a1.x - b1.x, a1.y - b1.y) / before);
    pan((a1.x + b1.x - a0.x - b0.x) / 2, (a1.y + b1.y - a0.y - b0.y) / 2);
  }

  function onPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_PAN_STEP, 0],
      ArrowRight: [KEY_PAN_STEP, 0],
      ArrowUp: [0, -KEY_PAN_STEP],
      ArrowDown: [0, KEY_PAN_STEP],
    };
    const move = moves[event.key];
    if (move) pan(move[0], move[1]);
    else if (event.key === "+" || event.key === "=") zoom(KEY_ZOOM_STEP);
    else if (event.key === "-") zoom(1 / KEY_ZOOM_STEP);
    else return;
    event.preventDefault();
  }

  function confirm() {
    const region = cropRegion(width, height, state);
    if (region) onConfirm(region);
    else onCancel();
  }

  return (
    <Modal open onClose={onCancel} title={t("profile.cropTitle")} maxWidth="max-w-sm">
      <Text as="p" id={hintId} variant="bodySmall" tone="secondary" className="mb-3">{t("profile.cropHint")}</Text>
      <div
        ref={stageRef}
        data-testid="profile-avatar-crop-stage"
        role="group"
        aria-roledescription={t("profile.cropTitle")}
        aria-describedby={hintId}
        tabIndex={0}
        className="relative w-full aspect-square overflow-hidden rounded-[var(--r-lg)] cursor-grab active:cursor-grabbing select-none"
        style={{ background: "var(--bg-2)", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
      >
        <canvas ref={canvasRef} aria-hidden="true" className="block w-full h-full" />
      </div>
      <Field label={t("profile.cropZoom")} htmlFor={zoomId} className="mt-4">
        <input
          id={zoomId}
          type="range"
          className="w-full"
          style={{ accentColor: "var(--accent)" }}
          min={1}
          max={maxZoom}
          step={0.01}
          value={state.zoom}
          disabled={maxZoom <= 1}
          onChange={event => zoom(Number(event.target.value) / state.zoom)}
        />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>{t("profile.cropCancel")}</Button>
        <Button type="button" variant="primary" onClick={confirm}>{t("profile.cropConfirm")}</Button>
      </div>
    </Modal>
  );
}
