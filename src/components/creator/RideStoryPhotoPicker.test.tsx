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
        startTime: new Date("2026-07-01T10:00:00Z").getTime(),
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
    expect(screen.getByTestId("ride-story-photo-route-inset")).toBeInTheDocument();

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
        startTime: new Date("2026-07-02T10:00:00Z").getTime(),
        summary: {
          distance: 18000,
          elevationGain: 540,
          ridingTimeMillis: 3_600_000,
        },
        thumbnailTrack: "37.54,126.98;37.55,126.99;37.56,127",
      },
    ]);
    setCollectionDocs("activity_photos/ride-2/photos", []);

    const { container } = renderWithProviders(
      <RideStoryPhotoPicker open userId="test-uid" onClose={vi.fn()} onSent={vi.fn()} onFailed={vi.fn()} />,
      { authenticated: true },
    );

    expect(await screen.findByText("남산 업힐")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /사진 업로드/ })).toBeInTheDocument();

    const input = container.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    fireEvent.change(input!, {
      target: {
        files: [new File(["photo"], "ride.jpg", { type: "image/jpeg" })],
      },
    });

    const uploadedPhoto = await screen.findByRole("button", { name: /남산 업힐 사진 1/ });
    expect(uploadedPhoto).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("ride-story-photo-route-inset")).toBeInTheDocument();
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
