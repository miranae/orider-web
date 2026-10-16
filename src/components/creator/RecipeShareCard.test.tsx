import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router-dom";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { RecipeShareCard } from "./RecipeShareCard";

const card = { title: "꾸준함이 만든 한 주", body: "4번의 라이딩, 186km. 나만의 리듬을 찾았습니다.", footer: "위치·민감 지표 제외" };
function Destination() { return <pre data-testid="post-state">{JSON.stringify(useLocation().state)}</pre>; }

it("labels sample output and prevents exporting or posting it as a real activity", () => {
  renderWithProviders(<RecipeShareCard card={card} language="ko" ready={false} onError={vi.fn()} />);
  expect(screen.getByText("디자인 예시 · 내 활동이 아닙니다")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "공유 문구 복사" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "PNG 저장" })).toBeDisabled();
  expect(screen.queryByRole("link", { name: "게시글로 공유" })).not.toBeInTheDocument();
});

it("edits and copies public copy, then passes only the reviewed public card to the post editor", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  renderWithProviders(<Routes><Route path="/" element={<RecipeShareCard card={card} language="ko" ready onError={vi.fn()} />} /><Route path="/ko/community/board/write" element={<Destination />} /></Routes>);
  fireEvent.click(screen.getByRole("button", { name: "문구 편집" }));
  fireEvent.change(screen.getByLabelText("공개 문구 (160자)"), { target: { value: "다음 라이딩도 즐겁게!" } });
  fireEvent.click(screen.getByRole("button", { name: "공유 문구 복사" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("다음 라이딩도 즐겁게!")));
  fireEvent.click(screen.getByRole("link", { name: "게시글로 공유" }));
  expect(screen.getByTestId("post-state").textContent).toContain("다음 라이딩도 즐겁게!");
  expect(screen.getByTestId("post-state").textContent).not.toContain("186km");
});

it("does not claim clipboard success when the API is unavailable", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  const onError = vi.fn();
  renderWithProviders(<RecipeShareCard card={card} language="en" ready onError={onError} />);
  fireEvent.click(screen.getByRole("button", { name: "Copy caption" }));
  await waitFor(() => expect(onError).toHaveBeenCalledOnce());
  expect(screen.queryByText("Copied")).not.toBeInTheDocument();
});

it("replaces a previous example or owner's edited card when a fresh server result arrives", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const { rerender } = renderWithProviders(<RecipeShareCard card={card} language="ko" ready={false} onError={vi.fn()} />);
  rerender(<RecipeShareCard card={{ title: "실제 서버 결과", body: "오늘의 실제 38km", footer: "민감 정보 제외" }} language="ko" ready onError={vi.fn()} />);
  expect(await screen.findByRole("img", { name: "실제 서버 결과" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "공유 문구 복사" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("오늘의 실제 38km")));
  expect(writeText.mock.calls[0]?.[0]).not.toContain("186km");
});

it("uses trusted metric fields and keeps a 160-character CJK caption legible without parsing prose", () => {
  const longBody = "가".repeat(160);
  const { container } = renderWithProviders(<RecipeShareCard card={{ ...card, body: longBody, metrics: [{ label: "거리", value: "186 km" }, { label: "부하", value: "미기록 포함" }, { label: "활동", value: "4회" }] }} language="ko" ready onError={vi.fn()} />);
  expect(screen.getByText("186 km")).toBeInTheDocument();
  const captionLines = [...container.querySelectorAll("svg text")].filter((element) => element.textContent?.startsWith("가"));
  expect(captionLines.map((element) => element.textContent).join("")).toBe(longBody);
  expect(captionLines).toHaveLength(7);
  for (const line of captionLines) expect(Number(line.getAttribute("font-size"))).toBeGreaterThanOrEqual(21);
  expect(screen.getByRole("button", { name: "PNG 저장" })).toBeEnabled();
});

it("blocks an overlong edited layout instead of silently exporting clipped text", () => {
  renderWithProviders(<RecipeShareCard card={card} language="ko" ready onError={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "문구 편집" }));
  fireEvent.change(screen.getByLabelText("공개 문구 (160자)"), { target: { value: Array(10).fill("새 문장").join("\n") } });
  expect(screen.getByRole("alert")).toHaveTextContent("본문은 7줄 이내");
  expect(screen.getByRole("button", { name: "PNG 저장" })).toBeDisabled();
  expect(screen.queryByRole("link", { name: "게시글로 공유" })).not.toBeInTheDocument();
});

it("embeds only raster data imagery into the same SVG used for story PNG export", () => {
  const imageDataUrl = "data:image/jpeg;base64,/9j/2Q==";
  const { container } = renderWithProviders(<RecipeShareCard card={{ ...card, imageDataUrl, imageAlt: "선택한 사진" }} language="ko" ready onError={vi.fn()} />);
  expect(container.querySelector("svg image")).toHaveAttribute("href", imageDataUrl);
  expect(container.querySelector("svg[viewBox]")).toHaveAttribute("viewBox", "0 0 720 1280");
});

it("fits long English secondary values into separate readable KPI columns", () => {
  const { container } = renderWithProviders(<RecipeShareCard card={{ ...card, metrics: [{ label: "DISTANCE", value: "186 km" }, { label: "RIDES", value: "INCOMPLETE" }, { label: "ELEVATION", value: "1,840 m" }] }} language="en" ready onError={vi.fn()} />);
  const left = [...container.querySelectorAll("svg text")].find(element => element.textContent === "INCOMPLETE")!;
  const right = [...container.querySelectorAll("svg text")].find(element => element.textContent === "1,840 m")!;
  expect(Number(left.getAttribute("font-size"))).toBe(24);
  expect(Number(left.getAttribute("x")) + Array.from("INCOMPLETE").length * 24).toBeLessThan(Number(right.getAttribute("x")));
  expect(Number(right.getAttribute("font-size"))).toBe(30);
});
