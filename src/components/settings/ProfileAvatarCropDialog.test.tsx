import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileAvatarCropDialog, type CropImage } from "./ProfileAvatarCropDialog";

const image = (width: number, height: number) => ({ width, height }) as unknown as CropImage;

function renderDialog(width = 1000, height = 500) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(<ProfileAvatarCropDialog image={image(width, height)} onCancel={onCancel} onConfirm={onConfirm} />);
  const stage = screen.getByTestId("profile-avatar-crop-stage");
  // jsdom 은 레이아웃이 없어 틀 크기를 정해 준다 — 틀 250 = 사진 500px(1 = 2px).
  Object.defineProperty(stage, "clientWidth", { configurable: true, value: 250 });
  return { onCancel, onConfirm, stage };
}

const confirm = () => fireEvent.click(screen.getByRole("button", { name: "완료" }));

describe("ProfileAvatarCropDialog", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("이름 붙은 모달로 열리고, 그대로 완료하면 예전 가운데 자르기 영역을 돌려준다", () => {
    const { onCancel, onConfirm } = renderDialog(1000, 500);
    const dialog = screen.getByRole("dialog", { name: "사진 영역 선택" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    confirm();
    expect(onConfirm).toHaveBeenCalledWith({ x: 250, y: 0, side: 500 });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("끌면 사진이 따라 움직이고 틀 밖으로는 나가지 않는다", () => {
    const { onConfirm, stage } = renderDialog(1000, 500);
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 100, clientY: 100 });
    // 사진을 왼쪽으로 50 끌면 영역은 오른쪽으로 100px.
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 50, clientY: 100 });
    fireEvent.pointerUp(stage, { pointerId: 1, clientX: 50, clientY: 100 });
    confirm();
    expect(onConfirm).toHaveBeenLastCalledWith({ x: 350, y: 0, side: 500 });

    fireEvent.pointerDown(stage, { pointerId: 2, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(stage, { pointerId: 2, clientX: 5000, clientY: 5000 });
    confirm();
    expect(onConfirm).toHaveBeenLastCalledWith({ x: 0, y: 0, side: 500 });
  });

  it("두 손가락을 벌리면 틀 가운데를 기준으로 확대한다", () => {
    const { onConfirm, stage } = renderDialog(1000, 500);
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 100, clientY: 125 });
    fireEvent.pointerDown(stage, { pointerId: 2, clientX: 150, clientY: 125 });
    fireEvent.pointerMove(stage, { pointerId: 2, clientX: 200, clientY: 125 });
    // 거리 50 → 100 이라 2배, 가운데점이 오른쪽으로 25 옮겨져 (2배 상태에서 1 = 1px) 영역은 왼쪽으로 25px.
    confirm();
    expect(onConfirm).toHaveBeenLastCalledWith({ x: 350, y: 125, side: 250 });
  });

  it("휠·확대 막대·키보드로 확대하고 옮길 수 있다", () => {
    const { onConfirm, stage } = renderDialog(4000, 3000);
    const slider = screen.getByRole("slider", { name: "확대" });
    // 슬라이더 이름은 화면에 보이는 라벨이다
    expect(screen.getByText("확대").tagName).toBe("LABEL");
    expect(slider).toHaveAttribute("max", "4");
    fireEvent.change(slider, { target: { value: "4" } });
    confirm();
    expect(onConfirm).toHaveBeenLastCalledWith({ x: 1625, y: 1125, side: 750 });

    fireEvent.wheel(stage, { deltaY: 100_000 });
    confirm();
    expect(onConfirm).toHaveBeenLastCalledWith({ x: 500, y: 0, side: 3000 });

    fireEvent.keyDown(stage, { key: "ArrowRight" });
    confirm();
    // 틀 250 = 사진 3000px → 16 = 192px. 사진이 오른쪽으로 가니 영역은 왼쪽으로.
    expect(onConfirm).toHaveBeenLastCalledWith({ x: 308, y: 0, side: 3000 });
  });

  it("128px 이하 사진은 확대할 수 없다", () => {
    const { onConfirm, stage } = renderDialog(100, 120);
    expect(screen.getByRole("slider", { name: "확대" })).toBeDisabled();
    fireEvent.wheel(stage, { deltaY: -1000 });
    confirm();
    expect(onConfirm).toHaveBeenLastCalledWith({ x: 0, y: 10, side: 100 });
  });

  it("취소 버튼·Esc·바깥 누르기는 영역 없이 닫기만 한다", () => {
    const { onCancel, onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    fireEvent.keyDown(document, { key: "Escape" });
    const backdrop = screen.getByRole("dialog").previousElementSibling!;
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
