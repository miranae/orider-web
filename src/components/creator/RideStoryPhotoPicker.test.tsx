import { useState } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { RideStoryPhotoPicker } from "./RideStoryPhotoPicker";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { mockSetDoc, setCollectionDocs } from "../../__tests__/mocks/firebase";

vi.mock("../../features/activity/detail/photoGps", () => ({
  extractGpsFromFile: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../features/activity/detail/imageResize", () => ({
  resizeImageToWebp: vi.fn().mockResolvedValue(new Blob(["webp"], { type: "image/webp" })),
}));

describe("RideStoryPhotoPicker", () => {
  it("lets riders choose either the route poster or an uploaded activity photo", async () => {
    setCollectionDocs("activities", [
      {
        id: "ride-1",
        userId: "test-uid",
        name: "한강 야간 라이딩",
        type: "Ride",
        startTime: Date.now() - 86_400_000,
        summary: {
          distance: 42195,
          elevationGain: 320,
          ridingTimeMillis: 5_400_000,
        },
        thumbnailTrack: "37.51,127.01;37.52,127.04;37.5,127.08",
      },
    ]);
    setCollectionDocs("activity_photos/ride-1/photos", [
      { id: "photo-1", url: "https://example.com/ride-photo.jpg", deletedAt: null, createdAt: 1 },
    ]);

    renderWithProviders(
      <RideStoryPhotoPicker open userId="test-uid" onClose={vi.fn()} onSent={vi.fn()} onFailed={vi.fn()} />,
      { authenticated: true },
    );

    expect(await screen.findByText("한강 야간 라이딩")).toBeInTheDocument();
    expect(screen.getByText("경로 미리보기")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "경로 미리보기" })).toBeInTheDocument();

    const routePosterButton = screen.getByRole("button", { name: /경로 포스터 선택/ });
    const photoButton = screen.getByRole("button", { name: /한강 야간 라이딩 사진 1/ });

    expect(photoButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(routePosterButton);
    await waitFor(() => expect(routePosterButton).toHaveAttribute("aria-pressed", "true"));

    fireEvent.click(photoButton);
    await waitFor(() => expect(photoButton).toHaveAttribute("aria-pressed", "true"));
  });

  it("uploads a new photo from the picker and selects it for the story", async () => {
    setCollectionDocs("activities", [
      {
        id: "ride-2",
        userId: "test-uid",
        name: "남산 업힐",
        type: "Ride",
        startTime: Date.now() - 172_800_000,
        summary: {
          distance: 18000,
          elevationGain: 540,
          ridingTimeMillis: 3_600_000,
        },
        thumbnailTrack: "37.54,126.98;37.55,126.99;37.56,127",
      },
    ]);
    setCollectionDocs("activity_photos/ride-2/photos", []);

    renderWithProviders(
      <RideStoryPhotoPicker open userId="test-uid" onClose={vi.fn()} onSent={vi.fn()} onFailed={vi.fn()} />,
      { authenticated: true },
    );

    expect(await screen.findByText("남산 업힐")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /사진 업로드/ })).toBeInTheDocument();

    const input = document.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    fireEvent.change(input!, {
      target: {
        files: [new File(["photo"], "ride.jpg", { type: "image/jpeg" })],
      },
    });

    const uploadedPhoto = await screen.findByRole("button", { name: /남산 업힐 사진 1/ });
    expect(uploadedPhoto).toHaveAttribute("aria-pressed", "true");
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringMatching(/^activity_photos\/ride-2\/photos\//) }),
      expect.objectContaining({
        url: "https://mock-storage.example.com/file",
        userId: "test-uid",
        deletedAt: null,
      }),
    );
  });
});


it("uses the feed description and readable date/sport fallbacks instead of document IDs", async () => {
  const recentStart = Date.now() - 86_400_000;
  const fallbackDate = new Date(recentStart - 86_400_000).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
  setCollectionDocs("activities", [
    { id: "orider_raw-id", userId: "test-uid", description: "출근길 라이딩", name: "orider_raw-id", type: "Ride", startTime: recentStart, summary: { distance: 12300, ridingTimeMillis: 9120000, elevationGain: 149 } },
    { id: "strava_raw-id", userId: "test-uid", name: "strava_raw-id", type: "Ride", startTime: recentStart - 86_400_000, summary: {} },
  ]);
  renderWithProviders(<RideStoryPhotoPicker open userId="test-uid" onClose={vi.fn()} onSent={vi.fn()} onFailed={vi.fn()} />, { authenticated: true });
  expect(await screen.findByRole("heading", { name: "출근길 라이딩" })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: `${fallbackDate} · 라이딩` })).toBeInTheDocument();
  expect(screen.queryByText(/orider_raw-id|strava_raw-id/)).toBeNull();
  const row = screen.getByRole("heading", { name: "출근길 라이딩" }).closest("section")!;
  expect(row).toHaveTextContent("이동거리 12.3 km · 활동시간 2시간 32분 · 상승고도 149 m");
  expect(screen.getByText("12.3 km").parentElement).toHaveClass("ride-story-metric");
  const send = screen.getByRole("button", { name: "선택한 사진으로 받기" });
  expect(send.querySelector(":scope > .ds-btn__icon svg")).not.toBeNull();
  expect(send.querySelector(".ds-btn__label svg")).toBeNull();
});

it("returns focus to its trigger when cancelled and supports Escape", async () => {
  setCollectionDocs("activities", []);
  function Harness() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>사진 고르기</button><RideStoryPhotoPicker open={open} userId="test-uid" onClose={() => setOpen(false)} onSent={vi.fn()} onFailed={vi.fn()} /></>;
  }
  renderWithProviders(<Harness />, { authenticated: true });
  const trigger = screen.getByRole("button", { name: "사진 고르기" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(await screen.findByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger).toHaveFocus();
});


it("keeps the portalled picker footer separate from its scrolling body and avoids duplicated fallback metadata", async () => {
  const recentStart = Date.now() - 86_400_000;
  const fallbackDate = new Date(recentStart).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
  setCollectionDocs("activities", [{ id: "strava_single", userId: "test-uid", type: "Ride", startTime: recentStart, summary: {} }]);
  setCollectionDocs("activity_photos/strava_single/photos", [{ id: "one", url: "https://example.com/one.jpg", deletedAt: null, createdAt: 1 }]);
  const { container } = renderWithProviders(<RideStoryPhotoPicker open userId="test-uid" onClose={vi.fn()} onSent={vi.fn()} onFailed={vi.fn()} />, { authenticated: true });
  const title = await screen.findByRole("heading", { name: `${fallbackDate} · 라이딩` });
  const dialog = screen.getByRole("dialog");
  expect(container).not.toContainElement(dialog);
  expect(dialog.closest(".ride-story-picker")).toBeInTheDocument();
  expect(title.closest("section")?.querySelector("p")).not.toHaveTextContent(fallbackDate);
  const footer = dialog.querySelector(".ride-story-picker-footer");
  expect(footer).toContainElement(screen.getByRole("button", { name: "선택한 사진으로 받기" }));
  expect(dialog.querySelector(".ride-story-picker-scroll")).not.toContainElement(footer as HTMLElement);
});

it("only offers recent, completed, undeleted cycling activities accepted by the server", async () => {
  const now = Date.now();
  const base = { userId: "test-uid", type: "Ride", startTime: now - 86_400_000, summary: { distance: 42000 } };
  setCollectionDocs("activities", [
    { ...base, id: "run", name: "달리기 제외", type: "Run" },
    { ...base, id: "substring", name: "부분일치 제외", type: "Stride" },
    { ...base, id: "old", name: "90일 초과 제외", startTime: now - 91 * 86_400_000 },
    { ...base, id: "future", name: "미래 기록 제외", startTime: now + 86_400_000 },
    { ...base, id: "deleted", name: "삭제 표시 제외", isDeleted: true },
    { ...base, id: "deleted-at", name: "삭제 시각 제외", deletedAt: now },
    { ...base, id: "valid-older", name: "가상 라이딩", type: "VirtualRide", startTime: now - 3 * 86_400_000 },
    { ...base, id: "valid-newer", name: "최신 산악 라이딩", type: "MountainBikeRide" },
  ]);
  renderWithProviders(<RideStoryPhotoPicker open userId="test-uid" onClose={vi.fn()} onSent={vi.fn()} onFailed={vi.fn()} />, { authenticated: true });
  expect(await screen.findByText("최신 산악 라이딩")).toBeInTheDocument();
  expect(screen.getByText("가상 라이딩")).toBeInTheDocument();
  for (const name of ["달리기 제외", "부분일치 제외", "90일 초과 제외", "미래 기록 제외", "삭제 표시 제외", "삭제 시각 제외"]) expect(screen.queryByText(name)).not.toBeInTheDocument();
  const titles = screen.getAllByRole("heading", { level: 3 });
  expect(titles.map((title) => title.textContent)).toEqual(["최신 산악 라이딩", "가상 라이딩"]);
});

it("shows an honest empty state when no server-eligible cycling activity exists", async () => {
  setCollectionDocs("activities", [{ id: "run-only", userId: "test-uid", type: "Run", name: "달리기", startTime: Date.now() - 86_400_000 }]);
  renderWithProviders(<RideStoryPhotoPicker open userId="test-uid" onClose={vi.fn()} onSent={vi.fn()} onFailed={vi.fn()} />, { authenticated: true });
  expect(await screen.findByText("최근 90일 안에 포스터로 만들 자전거 활동이 없습니다.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "선택한 사진으로 받기" })).toBeDisabled();
});
