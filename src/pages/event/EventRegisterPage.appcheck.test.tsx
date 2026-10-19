import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { getAppCheckToken } from "../../services/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { mockCallableInvocations, setCallableResult, setDocData, simulateLogin } from "../../__tests__/mocks/firebase";
import EventRegisterPage from "./EventRegisterPage";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const registrations = () => mockCallableInvocations.filter((call) => call.name === "joinOrCreateEvent");
const constructedRegistrations = () => vi.mocked(httpsCallable).mock.calls.filter((call) => call[1] === "joinOrCreateEvent");

async function readyForm() {
  setDocData("events/qa-new-event", { info: { name: "New private registration", status: "OPEN", type: "TOUR",
    feeType: "FREE", categories: [], startTime: new Date("2026-10-16T12:00:00+09:00").getTime(),
    closeAt: "2026-10-16T00:00:00+09:00" } });
  const view = renderWithProviders(<Routes><Route path="/ko/event/:eventId/register" element={<EventRegisterPage />} /></Routes>,
    { route: "/ko/event/qa-new-event/register", authenticated: true });
  fireEvent.change(await screen.findByPlaceholderText("홍길동"), { target: { value: "QA Rider" } });
  fireEvent.click(screen.getByRole("button", { name: "생년월일 선택" }));
  // 생일은 UTC 기반 max와 로컬 오늘 날짜 모두보다 이전이어야 한다.
  const birthday = within(screen.getByRole("dialog")).getByLabelText("2026-10-01");
  expect(birthday).toHaveAttribute("role", "gridcell");
  expect(birthday).toBeVisible();
  fireEvent.click(birthday);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "남성" }));
  fireEvent.change(screen.getByPlaceholderText("010-0000-0000"), { target: { value: "010-1234-5678" } });
  fireEvent.change(screen.getByPlaceholderText("전화번호"), { target: { value: "010-0000-0000" } });
  fireEvent.click(screen.getByRole("button", { name: "다음 →", exact: true }));
  fireEvent.click(screen.getByRole("checkbox", { name: /이벤트 참가 약관/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /개인정보 수집·이용 동의/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /면책 동의서/ }));
  return view;
}

describe.each([
  "2026-10-14T23:59:00+09:00",
  "2026-10-15T00:00:00+09:00",
])("EventRegisterPage cold authenticated App Check admission at %s", (now) => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    vi.mocked(httpsCallable).mockClear();
    vi.mocked(getAppCheckToken).mockReset().mockResolvedValue("warm-token");
    setCallableResult("joinOrCreateEvent", { data: { registrationNumber: "QA-NEW-001" } });
  });

  afterEach(() => { vi.useRealTimers(); });

  it("waits for the first token and sends one registration despite duplicate clicks", async () => {
    const token = deferred<string | null>();
    vi.mocked(getAppCheckToken).mockReturnValueOnce(token.promise);
    await readyForm();
    const submit = screen.getByRole("button", { name: /참가 신청/ });
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(constructedRegistrations()).toHaveLength(0);
    expect(registrations()).toHaveLength(0);
    await act(async () => { token.resolve("cold-token"); });
    await waitFor(() => expect(registrations()).toHaveLength(1));
    expect(constructedRegistrations()).toHaveLength(1);
    expect(registrations()[0].data).toMatchObject({ eventId: "qa-new-event", profile: { name: "QA Rider" } });
    expect(await screen.findByText("QA-NEW-001")).toBeInTheDocument();
  });

  it("sends nothing on token failure and allows one new normal attempt", async () => {
    vi.mocked(getAppCheckToken).mockRejectedValueOnce(new Error("app-check/token-timeout"));
    await readyForm();
    fireEvent.click(screen.getByRole("button", { name: /참가 신청/ }));
    await screen.findByText("app-check/token-timeout");
    expect(constructedRegistrations()).toHaveLength(0);
    expect(registrations()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /참가 신청/ }));
    await waitFor(() => expect(registrations()).toHaveLength(1));
  });

  it("drops an old token after an account ABA transition", async () => {
    const token = deferred<string | null>();
    vi.mocked(getAppCheckToken).mockReturnValueOnce(token.promise);
    await readyForm();
    fireEvent.click(screen.getByRole("button", { name: /참가 신청/ }));
    await act(async () => { simulateLogin({ uid: "other-uid" }); simulateLogin({ uid: "test-uid" }); });
    await act(async () => { token.resolve("stale-token"); });
    expect(constructedRegistrations()).toHaveLength(0);
    expect(registrations()).toHaveLength(0);
  });
});
