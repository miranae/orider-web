import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lazy, type ComponentType } from "react";
import DeferredHomeTodayStrip from "./DeferredHomeTodayStrip";

const loads = vi.hoisted(() => ({ next: () => Promise.resolve({ default: (() => null) as ComponentType }) }));
vi.mock("../../utils/lazyWithRetry", () => ({ lazyWithRetry: () => lazy(() => loads.next()) }));
vi.mock("../../services/sentry", () => ({ captureError: vi.fn() }));
const props = { discipline: "bike" as const, fitness: null, conditionSummary: null, thresholdSummary: null, monthlyKm: 0, weeklyAverageKm: 0, mobile: false };
afterEach(() => vi.restoreAllMocks());

describe("desktop home module boundary", () => {
  it("keeps the feed visible while the desktop module loads and then displays the existing strip", async () => {
    let resolve!: (value: { default: ComponentType }) => void;
    loads.next = () => new Promise(done => { resolve = done; });
    render(<><div>visible feed</div><DeferredHomeTodayStrip {...props} /></>);
    expect(screen.getByText("visible feed")).toBeVisible();
    expect(screen.getByRole("status")).toBeVisible();
    await act(async () => resolve({ default: () => <div>desktop training content</div> }));
    expect(await screen.findByText("desktop training content")).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps the feed on a failed load and explicitly retries the same desktop content", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    loads.next = () => Promise.reject(new Error("offline module unavailable"));
    render(<><div>visible feed</div><DeferredHomeTodayStrip {...props} /></>);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByText("visible feed")).toBeVisible();
    loads.next = () => Promise.resolve({ default: () => <div>recovered desktop content</div> });
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("recovered desktop content")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
