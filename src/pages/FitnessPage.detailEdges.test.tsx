import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useLocation, useSearchParams } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { mockCallableInvocations, setDocData } from "../__tests__/mocks/firebase";
import { useFitnessModel } from "../hooks/useFitnessModel";
import { FitnessView } from "./FitnessPage";

const viewport = vi.hoisted(() => ({ mobile: true }));
vi.mock("../hooks/useMobile", () => ({ useMobile: () => viewport.mobile }));

function Fixture({ embedded = false, part = "analysis", canonicalEmpty = false }: { embedded?: boolean; part?: "analysis" | "condition"; canonicalEmpty?: boolean }) {
  const [params] = useSearchParams();
  const location = useLocation();
  const model = useFitnessModel(params.get("sport"));
  return <><output data-testid="edge-url">{location.pathname}{location.search}{location.hash}</output><FitnessView embedded={embedded} part={part} model={canonicalEmpty ? { ...model, canonicalFitness: { ...model.canonicalFitness, enabled: true, values: null, display: "empty" } } : model} /></>;
}

beforeEach(() => {
  viewport.mobile = true;
  setDocData("users/test-uid/fitness/activity_window", { version: 1, windowDays: 90, maxEntries: 768, generation: 1, updatedAt: Date.now(), truncated: false, entries: [] });
});

it.each([{ mobile: true, suffix: "#ftp-decision" }, { mobile: true, suffix: "&decisionId=existing" }, { mobile: false, suffix: "#ftp-decision" }, { mobile: false, suffix: "&decisionId=existing" }])("preserves no-history FTP direct entry on mobile=$mobile via $suffix without dropping query context", async ({ mobile, suffix }) => {
  viewport.mobile = mobile;
  renderWithProviders(<Fixture />, { authenticated: true, route: `/ko/coach/analysis?sport=bike&range=90${suffix}` });
  await waitFor(() => expect(document.getElementById("ftp-decision")).not.toBeNull());
  if (mobile) {
    const detail = await screen.findByRole("dialog");
    expect(detail).toHaveAccessibleName(/FTP/);
    fireEvent.click(within(detail).getByRole("button", { name: /뒤로/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("edge-url")).toHaveTextContent(suffix.startsWith("#") ? "sport=bike&range=90&detail=closed#ftp-decision" : "sport=bike&range=90&decisionId=existing&detail=closed");
  } else {
    expect(document.getElementById("ftp-decision")).toHaveProperty("open", true);
  }
  expect(mockCallableInvocations.filter(call => /accept|apply|update|create/i.test(call.name))).toHaveLength(0);
});

it("keeps FTP entry available in canonical empty analysis", async () => {
  renderWithProviders(<Fixture canonicalEmpty />, { authenticated: true, route: "/ko/coach/analysis?sport=bike#ftp-decision" });
  expect(await screen.findByRole("dialog")).toHaveAccessibleName(/FTP/);
});

it.each([{ embedded: true, part: "analysis" }, { embedded: false, part: "condition" }] as const)("does not add empty FTP detail to embedded=$embedded part=$part", async props => {
  renderWithProviders(<Fixture {...props} />, { authenticated: true, route: `/ko/coach/${props.part}?sport=bike#ftp-decision` });
  expect(await screen.findByText("피트니스 차트를 만들 활동이 아직 없어요")).toBeInTheDocument();
  expect(document.getElementById("ftp-decision")).toBeNull();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("explains a bike-only detail in running and only clears it through the explicit current-analysis link", async () => {
  renderWithProviders(<Fixture />, { authenticated: true, route: "/ko/coach/analysis?sport=run&range=90&detail=analysis-model#old-anchor" });
  expect(await screen.findByText("이 상세는 현재 선택한 종목의 분석에 없습니다.")).toHaveAttribute("role", "status");
  expect(screen.getByTestId("edge-url")).toHaveTextContent("sport=run&range=90&detail=analysis-model#old-anchor");
  const link = screen.getByRole("link", { name: "현재 종목 분석 보기" });
  expect(link).toHaveAttribute("href", "/ko/coach/analysis?sport=run&range=90");
  fireEvent.click(link);
  await waitFor(() => expect(screen.queryByText("이 상세는 현재 선택한 종목의 분석에 없습니다.")).not.toBeInTheDocument());
  expect(screen.getByTestId("edge-url").textContent).toBe("/ko/coach/analysis?sport=run&range=90");
});
