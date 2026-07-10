import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import ActivityUploadPage from "./ActivityUploadPage";

function fileNamed(name: string, size = 128) {
  return new File([new Uint8Array(size)], name, { type: "application/octet-stream", lastModified: 1 });
}

async function uploadInput(container: HTMLElement) {
  await screen.findByRole("button", { name: "파일 선택 영역" });
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("file input missing");
  return input;
}

describe("ActivityUploadPage", () => {
  it("keeps rejected extension files visible with a reason", async () => {
    const { container } = renderWithProviders(<ActivityUploadPage />, { authenticated: true });

    fireEvent.change(await uploadInput(container), {
      target: { files: [fileNamed("ride.zip")] },
    });

    expect(await screen.findByText("ride.zip · 0 KB")).toBeInTheDocument();
    expect(screen.getByText(/FIT, GPX, TCX 파일만 업로드할 수 있습니다/)).toBeInTheDocument();
    expect(screen.getByText("1개 파일을 추가하지 못했습니다.")).toBeInTheDocument();
  });

  it("keeps oversized files visible with a size reason", async () => {
    const { container } = renderWithProviders(<ActivityUploadPage />, { authenticated: true });

    fireEvent.change(await uploadInput(container), {
      target: { files: [fileNamed("long.fit", 10 * 1024 * 1024 + 1)] },
    });

    expect(await screen.findByText(/long\.fit · 10\.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/파일이 너무 큽니다/)).toBeInTheDocument();
    expect(screen.getByText(/최대 10\.0 MB/)).toBeInTheDocument();
  });

  it("shows an error toast when upload cannot start", async () => {
    const { container } = renderWithProviders(<ActivityUploadPage />, { authenticated: true });

    fireEvent.change(await uploadInput(container), {
      target: { files: [fileNamed("ride.fit")] },
    });
    fireEvent.click(await screen.findByRole("button", { name: "1개 업로드" }));

    await waitFor(() => {
      expect(screen.getByText("업로드를 시작하지 못했습니다.")).toBeInTheDocument();
    });
  });
});
