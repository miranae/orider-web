// @vitest-environment jsdom
import { useState } from "react";
import i18n from "../../i18n";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MeetingSegmentPicker, { MeetingSegmentCards } from "./MeetingSegments";
import { loadSegmentDetail, type MeetingSegment } from "./segmentCatalog";
vi.mock("./segmentCatalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./segmentCatalog")>()),
  loadSegmentDetail: vi.fn(async (choice) => choice),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(loadSegmentDetail)
    .mockReset()
    .mockImplementation(async (choice) => choice);
});
const sample = {
  id: "real-id",
  name: "정선 고개",
  distance: 3200,
  averageGrade: 5.5,
  city: "정선",
};
function Harness() {
  const [segments, setSegments] = useState<MeetingSegment[]>([]);
  return (
    <>
      <MeetingSegmentPicker selected={segments} onChange={setSegments} />
      <MeetingSegmentCards segments={segments} />
    </>
  );
}
describe("주요 구간 선택 화면", () => {
  it("영문 표시에서도 진행방식 원본값을 유지한다", async () => {
    await i18n.changeLanguage("en");
    const onChange = vi.fn();
    try {
      render(
        <MeetingSegmentPicker
          selected={[
            {
              ...sample,
              source: "public-catalog",
              mode: "함께",
              instruction: "",
            },
          ]}
          onChange={onChange}
        />,
      );
      const mode = screen.getByLabelText(
        "How to ride this section",
      ) as HTMLSelectElement;
      expect(mode.value).toBe("함께");
      expect(screen.getByRole("option", { name: "Open section" })).toHaveValue(
        "오픈",
      );
      fireEvent.change(mode, { target: { value: "오픈" } });
      expect(onChange.mock.calls[0]![0][0].mode).toBe("오픈");
    } finally {
      await i18n.changeLanguage("ko");
    }
  });
  it("실패 후 재시도하고 검색·선택·설명·진행 방식·상세 연결·제거를 지원한다", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ segments: [sample] }), {
            headers: { "content-type": "application/json" },
          }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(<Harness />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "기존 세그먼트 찾기" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText("세그먼트 이름·지역 검색"), {
      target: { value: "정선" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "구간 선택", exact: true }),
    );
    expect(
      (await screen.findByRole("button", { name: "선택됨" })).hasAttribute(
        "disabled",
      ),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("구간 진행 방식"), {
      target: { value: "재집결" },
    });
    fireEvent.change(screen.getByLabelText("주최자의 구간 안내"), {
      target: { value: "정상에서 만나요." },
    });
    expect(
      screen.getByText("정상에서 만나요.", { selector: "p" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /기존 세그먼트 상세.*새 탭/ })
        .getAttribute("href"),
    ).toBe("/ko/segment/real-id");
    fireEvent.click(screen.getByRole("button", { name: "정선 고개 제거" }));
    expect(
      screen.queryByRole("link", { name: /기존 세그먼트 상세/ }),
    ).toBeNull();
  });
  it("선택 개수 제한은 목록 재시도를 요구하지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(
          async () =>
            new Response(JSON.stringify({ segments: [sample] }), {
              headers: { "content-type": "application/json" },
            }),
        ),
    );
    const selected: MeetingSegment[] = Array.from(
      { length: 12 },
      (_, index) => ({
        id: `selected-${index}`,
        name: `구간 ${index}`,
        mode: "함께",
        instruction: "",
        source: "public-catalog",
      }),
    );
    render(<MeetingSegmentPicker selected={selected} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "기존 세그먼트 찾기" }));
    fireEvent.change(screen.getByLabelText("세그먼트 이름·지역 검색"), {
      target: { value: "정선" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "구간 선택", exact: true }),
    );
    expect(screen.getByRole("alert").textContent).toContain("12개");
    expect(screen.queryByRole("button", { name: "다시 불러오기" })).toBeNull();
  });

  it("상세 수치와 경로를 선택에 반영하고 실패하면 공개 목록 정보로 선택한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ segments: [sample] }), {
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const onChange = vi.fn();
    vi.mocked(loadSegmentDetail).mockResolvedValueOnce({
      ...sample,
      elevationGain: 0,
      geometry: [
        { lat: 37, lon: 127 },
        { lat: 37.1, lon: 127.1 },
      ],
    });
    render(<MeetingSegmentPicker selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "기존 세그먼트 찾기" }));
    fireEvent.change(screen.getByLabelText("세그먼트 이름·지역 검색"), {
      target: { value: "정선" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "구간 선택", exact: true }),
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({
          elevationGain: 0,
          geometry: [
            { lat: 37, lon: 127 },
            { lat: 37.1, lon: 127.1 },
          ],
        }),
      ]),
    );
    onChange.mockClear();
    vi.mocked(loadSegmentDetail).mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(
      screen.getByRole("button", { name: "구간 선택", exact: true }),
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ distance: 3200 }),
      ]),
    );
    expect(screen.getByRole("alert").textContent).toContain("공개 목록");
  });
  it("상세 조회 중 부모를 busy로 알리고 모드 전환 언마운트에서 해제한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ segments: [sample] }), {
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    let resolve!: (value: typeof sample) => void;
    vi.mocked(loadSegmentDetail).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const onBusyChange = vi.fn();
    const view = render(
      <MeetingSegmentPicker
        selected={[]}
        onChange={vi.fn()}
        onBusyChange={onBusyChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "기존 세그먼트 찾기" }));
    fireEvent.change(screen.getByLabelText("세그먼트 이름·지역 검색"), {
      target: { value: "정선" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "구간 선택", exact: true }),
    );
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    view.unmount();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    resolve(sample);
    await Promise.resolve();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });
  it("부모 busy 갱신으로 같은 내용의 배열이 재생성되어도 선택을 적용한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ segments: [sample] }), {
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    function BusyHarness() {
      const [busy, setBusy] = useState(false);
      const [selected, setSelected] = useState<MeetingSegment[]>([]);
      return (
        <>
          <span>{busy ? "처리중" : "대기"}</span>
          <MeetingSegmentPicker
            selected={selected.filter(() => true)}
            onChange={setSelected}
            onBusyChange={setBusy}
          />
        </>
      );
    }
    render(<BusyHarness />);
    fireEvent.click(screen.getByRole("button", { name: "기존 세그먼트 찾기" }));
    fireEvent.change(screen.getByLabelText("세그먼트 이름·지역 검색"), {
      target: { value: "정선" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "구간 선택", exact: true }),
    );
    expect(await screen.findByRole("button", { name: "선택됨" })).toBeTruthy();
  });
  it("언마운트 후 상세 응답을 적용하지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ segments: [sample] }), {
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    let resolve!: (value: typeof sample) => void;
    vi.mocked(loadSegmentDetail).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const onChange = vi.fn();
    const view = render(
      <MeetingSegmentPicker selected={[]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "기존 세그먼트 찾기" }));
    fireEvent.change(screen.getByLabelText("세그먼트 이름·지역 검색"), {
      target: { value: "정선" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "구간 선택", exact: true }),
    );
    view.unmount();
    resolve(sample);
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });
  it("선택 요청 중 원본 선택 목록이 바뀌면 늦은 응답을 덧붙이지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ segments: [sample] }), {
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    let resolve!: (value: typeof sample) => void;
    vi.mocked(loadSegmentDetail).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const onChange = vi.fn();
    const view = render(
      <MeetingSegmentPicker selected={[]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "기존 세그먼트 찾기" }));
    fireEvent.change(screen.getByLabelText("세그먼트 이름·지역 검색"), {
      target: { value: "정선" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "구간 선택", exact: true }),
    );
    view.rerender(
      <MeetingSegmentPicker
        selected={[
          {
            id: "newer",
            name: "다른 구간",
            mode: "함께",
            instruction: "",
            source: "public-catalog",
          },
        ]}
        onChange={onChange}
      />,
    );
    resolve(sample);
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "구간 선택", exact: true })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(onChange).not.toHaveBeenCalled();
  });
  it("기존 선택을 새로 가져오는 동안 제거하면 늦은 응답으로 복원하지 않는다", async () => {
    let resolve!: (value: typeof sample) => void;
    vi.mocked(loadSegmentDetail).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ segments: [sample] }), {
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const selected: MeetingSegment[] = [
      {
        ...sample,
        mode: "함께",
        instruction: "유지",
        source: "public-catalog",
      },
    ];
    const onChange = vi.fn();
    const view = render(
      <MeetingSegmentPicker selected={selected} onChange={onChange} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "구간 정보 다시 가져오기" }),
    );
    await waitFor(() => expect(loadSegmentDetail).toHaveBeenCalled());
    view.rerender(<MeetingSegmentPicker selected={[]} onChange={onChange} />);
    resolve(sample);
    await Promise.resolve();
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });
});
