import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AboutPage from "./AboutPage";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ko" },
  }),
}));

describe("AboutPage route locale", () => {
  it("uses the URL locale even before i18n catches up", async () => {
    const replace = vi.fn();

    render(
      <MemoryRouter initialEntries={["/en/about"]}>
        <Routes>
          <Route path="/:lang/about" element={<AboutPage replace={replace} />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/en/about/index.html");
    });
    expect(replace).toHaveBeenCalledOnce();
  });
});
