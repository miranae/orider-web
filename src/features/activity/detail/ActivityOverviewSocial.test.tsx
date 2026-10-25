import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import type { Activity } from "@shared/types";
import ActivityOverviewSocial, { type OverviewPhoto } from "./ActivityOverviewSocial";

const nativeLoad = vi.hoisted(() => vi.fn());
vi.mock("../../../services/nativeActivityPhoto", async importOriginal => ({ ...await importOriginal<typeof import("../../../services/nativeActivityPhoto")>(), loadNativeActivityPhoto: nativeLoad }));

const photo = (index: number): OverviewPhoto => ({ id: `strava-${index}`, url: `https://images.example/${index}.jpg`, caption: `Photo ${index}` });
const base = { activityId: "strava_1", memo: "작성자가 남긴 실제 메모", photos: Array.from({ length: 5 }, (_, index) => photo(index)), totalPhotos: 9,
  companions: [] as Activity[], achievements: [{ id: "effort", segmentId: "123", name: "남산 업힐", badge: "PR", time: "5:12", effortId: 99 }],
  owner: false, uploading: false, canUpload: false, loadingPhotos: false, canLoadPhotos: true,
  onLoadPhotos: vi.fn(), onUpload: vi.fn(), onDelete: vi.fn(), onLocate: vi.fn(), onShowResults: vi.fn() };
beforeEach(() => vi.clearAllMocks());
it("shows five real previews and remaining count, opens a full viewer and explicitly loads missing photos", () => {
  const view = renderWithProviders(<ActivityOverviewSocial {...base} />);
  expect(screen.getByText("+5")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "사진 5 / 9 보기" }));
  expect(base.onLoadPhotos).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("dialog")).toHaveTextContent("5 / 9");
  expect(screen.getByRole("button", { name: "다음 사진" })).toBeDisabled();
  view.rerender(<ActivityOverviewSocial {...base} photos={Array.from({ length: 9 }, (_, index) => photo(index))} />);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
  expect(screen.getByRole("dialog")).toHaveTextContent("6 / 9");
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
  expect(screen.getByRole("dialog")).toHaveTextContent("5 / 9");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "사진 1 / 9 보기" }));
  fireEvent.click(screen.getByRole("button", { name: "이전 사진" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("9 / 9");
  fireEvent.click(screen.getByRole("button", { name: "다음 사진" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("1 / 9");
});
it("keeps upload and delete owner boundaries and photo location actions", () => {
  const uploaded = { ...photo(0), id: "upload-one", uploadId: "one", ownerId: "owner", location: [37, 127] as [number, number] };
  const view = renderWithProviders(<ActivityOverviewSocial {...base} photos={[uploaded]} totalPhotos={1} viewerId="viewer" />);
  fireEvent.click(screen.getByRole("button", { name: "사진 1 / 1 보기" }));
  expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
  view.rerender(<ActivityOverviewSocial {...base} photos={[uploaded]} totalPhotos={1} viewerId="owner" owner canUpload />);
  fireEvent.click(screen.getByRole("button", { name: "삭제" }));
  expect(base.onDelete).toHaveBeenCalledWith("one");
  fireEvent.click(screen.getByRole("button", { name: /지도/ }));
  expect(base.onLocate).toHaveBeenCalledWith([37, 127]);
  fireEvent.click(screen.getByRole("button", { name: "사진 추가" }));
  expect(base.onUpload).toHaveBeenCalledTimes(1);
});
it("distinguishes missing content from load failure and clears the viewer on activity change", () => {
  const view = renderWithProviders(<ActivityOverviewSocial {...base} />);
  fireEvent.click(screen.getByRole("button", { name: "사진 1 / 9 보기" }));
  view.rerender(<ActivityOverviewSocial {...base} activityId="two" memo={null} photos={[]} totalPhotos={0} achievements={[]} photoError="private backend detail" />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("등록된 메모가 없어요.")).toBeInTheDocument();
  expect(screen.queryByText("등록된 사진이 없어요.")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("사진을 불러오지 못했어요.");
  expect(screen.queryByText("private backend detail")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /함께 탄 라이더/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "주요 성과" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "전체 보기" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(base.onLoadPhotos).toHaveBeenCalled();
});
it("expands actual overflowing memo and preserves source text, highlights and verified companions", () => {
  let measure = () => {};
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { measure = callback; } observe() {} disconnect() {} });
  const rider = { id: "ride-two", userId: "rider", nickname: "실제 동승자", profileImage: null } as Activity;
  const view = renderWithProviders(<ActivityOverviewSocial {...base} companions={[rider]} />);
  const memo = screen.getByText(base.memo);
  Object.defineProperties(memo, { scrollHeight: { value: 100 }, clientHeight: { value: 60 } });
  act(() => measure());
  fireEvent.click(screen.getByRole("button", { name: /더보기|더 보기/ }));
  expect(screen.getByRole("button", { name: "접기" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("link", { name: "실제 동승자" })).toHaveAttribute("href", "/ko/activity/ride-two");
  expect(screen.getByRole("link", { name: "남산 업힐" }).getAttribute("href")).toContain("currentEffortId=strava_99");
  fireEvent.click(screen.getByRole("button", { name: "전체 보기" }));
  expect(base.onShowResults).toHaveBeenCalledTimes(1);
  view.unmount(); vi.unstubAllGlobals();
});

it("does not report unknown or still loading media as an empty gallery", () => {
  const view = renderWithProviders(<ActivityOverviewSocial {...base} photos={[]} totalPhotos={0} photosKnown={false} />);
  expect(screen.queryByText("등록된 사진이 없어요.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "사진 더 불러오기" }));
  expect(base.onLoadPhotos).toHaveBeenCalledTimes(1);
  view.rerender(<ActivityOverviewSocial {...base} photos={[]} totalPhotos={0} photosKnown={false} loadingPhotos />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  view.rerender(<ActivityOverviewSocial {...base} photos={[]} totalPhotos={0} photosKnown />);
  expect(screen.queryByText("등록된 사진이 없어요.")).not.toBeInTheDocument();
});


it("reads mobile achievements before the story without duplicating results or changing desktop order", () => {
  const view = renderWithProviders(<ActivityOverviewSocial {...base} prioritizeResults />);
  const results = view.container.querySelector(".activity-overview-results")!;
  const story = view.container.querySelector(".activity-overview-story")!;
  expect(results.compareDocumentPosition(story) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getAllByRole("link", { name: "남산 업힐" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "전체 보기" }));
  expect(base.onShowResults).toHaveBeenCalledOnce();
  view.rerender(<ActivityOverviewSocial {...base} />);
  expect(story.compareDocumentPosition(results) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("renders a native photo reference through authorized bytes instead of a storage URL", async () => {
  nativeLoad.mockResolvedValue(new Blob(["photo"], {type:"image/webp"}));
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:authorized-photo");
  const reference = {activityId:"native-ride",photoId:"native-photo"};
  renderWithProviders(<ActivityOverviewSocial {...base} photos={[{id:"native-photo",url:"",nativePhoto:reference,caption:"Native photo"}]} totalPhotos={1} />);
  await waitFor(() => expect(screen.getByRole("img",{name:"Native photo"})).toHaveAttribute("src","blob:authorized-photo"));
  expect(nativeLoad).toHaveBeenCalledWith(expect.anything(),reference);
  fireEvent.click(screen.getByRole("button",{name:"사진 1 / 1 보기"}));
  expect(await screen.findByRole("dialog")).toHaveTextContent("1 / 1");
  create.mockRestore();
});
