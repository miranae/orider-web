import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { useLocalizedNavigate } from "../hooks/useLocalizedNavigate";
import { sanitizeInternalReturnPath } from "./internalReturnPath";

function ReturnAction({ value }: { value: string }) {
  const navigate = useLocalizedNavigate();
  const location = useLocation();
  return <><button onClick={() => navigate(sanitizeInternalReturnPath(value))}>Return</button>
    <output>{location.pathname}{location.search}{location.hash}</output></>;
}

describe("sanitized handoff through localized navigation", () => {
  it.each(["/.//evil.com/x", "/ko/..//evil.com/x", "/ko//evil.com/x", "/ko/..\\\\evil.com", "/%5C%5Cevil.com"])("keeps adversarial %s in the app", value => {
    renderWithProviders(<Routes><Route path="/:lang/*" element={<ReturnAction value={value} />} /></Routes>, { route: "/ko/onboarding" });
    fireEvent.click(screen.getByRole("button", { name: "Return" }));
    expect(screen.getByRole("status")).toHaveTextContent("/ko/");
    expect(screen.getByRole("status")).not.toHaveTextContent("evil.com");
  });
  it("normalizes safe path segments and retains sport/date/hash through navigation", () => {
    renderWithProviders(<Routes><Route path="/:lang/*" element={<ReturnAction value="/ko/athlete/../coach/plan?sport=run&date=2026-12-01#calendar" />} /></Routes>, { route: "/ko/onboarding" });
    fireEvent.click(screen.getByRole("button", { name: "Return" }));
    expect(screen.getByRole("status")).toHaveTextContent("/ko/coach/plan?sport=run&date=2026-12-01#calendar");
  });
  it("rejects an unsafe fallback as well as an unsafe requested route", () => {
    expect(sanitizeInternalReturnPath("//evil.com", "/.//other.com")).toBe("/");
    expect(sanitizeInternalReturnPath(null, "/en/athlete/../coach/plan?sport=swim")).toBe("/en/coach/plan?sport=swim");
  });
});
