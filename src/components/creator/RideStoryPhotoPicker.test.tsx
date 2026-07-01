import { fireEvent, screen, waitFor } from "@testing-library/react";
import { RideStoryPhotoPicker } from "./RideStoryPhotoPicker";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { setCollectionDocs } from "../../__tests__/mocks/firebase";

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

    const routePosterButton = screen.getByRole("button", { name: /경로 포스터 선택/ });
    const photoButton = screen.getByRole("button", { name: /한강 야간 라이딩 사진 1/ });

    expect(photoButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(routePosterButton);
    await waitFor(() => expect(routePosterButton).toHaveAttribute("aria-pressed", "true"));

    fireEvent.click(photoButton);
    await waitFor(() => expect(photoButton).toHaveAttribute("aria-pressed", "true"));
  });
});
