import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { FitnessZoneDistributions, type FitnessZoneEvidence } from "./FitnessZoneDistributions";

const evidence: FitnessZoneEvidence = {
  windowDays: 30, startTime: Date.UTC(2026, 8, 19), endTime: Date.UTC(2026, 9, 19),
  hr: { counts: [30, 70, 0, 0, 0], total: 100, recordCount: 2, missingCount: 1, boundaries: null },
  power: { counts: [10, 20, 30, 40, 0, 0, 0], total: 100, recordCount: 1, missingCount: 2 },
};

describe("FitnessZoneDistributions", () => {
  it("shows both distinct stored distributions, seconds and percentages with their shared explicit period", () => {
    const { container } = renderWithProviders(<FitnessZoneDistributions evidence={evidence} />);
    const cards = container.querySelectorAll(".fitness-zone-evidence__card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0] as HTMLElement).getAllByRole("listitem")).toHaveLength(5);
    expect(within(cards[1] as HTMLElement).getAllByRole("listitem")).toHaveLength(7);
    expect(cards[0]).toHaveTextContent("30초 · 30%");
    expect(cards[1]).toHaveTextContent("40초 · 40%");
    expect(screen.getAllByText(/최근 30일/)).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("미확인/불완전 1개");
    expect(cards[1]).toHaveTextContent("미확인/불완전 2개");
    expect(container).not.toHaveTextContent("200 bpm");
  });

  it("does not turn absent data into zero zones while preserving confirmed zero seconds", () => {
    const { container } = renderWithProviders(<FitnessZoneDistributions evidence={{ ...evidence,
      hr: { ...evidence.hr, counts: null, total: 0, recordCount: 0 },
      power: { ...evidence.power, counts: [0, 0, 0, 0, 0, 0, 0], total: 0 },
    }} />);
    expect(screen.getByText("확인 가능한 존 기록이 없습니다.")).toBeVisible();
    expect(container.querySelectorAll("li")).toHaveLength(7);
    expect(screen.getAllByText("0초 · —%")).toHaveLength(7);
  });

  it("only displays explicit server boundaries and preserves their exclusive upper limits", () => {
    renderWithProviders(<FitnessZoneDistributions evidence={{ ...evidence, hr: { ...evidence.hr, boundaries: {
      reference: "lthr", referenceBpm: 170, sport: "bike",
      zones: [{ zone: 1, minPct: 0, maxPct: 81, minBpm: 0, maxBpmExclusive: 138 }],
    } } }} />);
    expect(screen.getByText("서버 저장 경계 · LTHR 170 bpm")).toBeVisible();
    expect(screen.getByText("0–<138 bpm · 0–81% LTHR")).toBeVisible();
  });
});
