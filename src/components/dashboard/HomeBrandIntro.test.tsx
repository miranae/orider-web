import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "i18next";
import enDashboard from "../../i18n/resources/en/dashboard.json";
import { HomeBrandIntro } from "./HomeBrandIntro";

describe("HomeBrandIntro", () => {
  afterEach(async () => { await i18n.changeLanguage("ko"); });

  it("슬로건과 한국어 병기를 보여주고 시작하기로 로그인을 연다", () => {
    const onStart = vi.fn();
    render(<HomeBrandIntro layout="card" onStart={onStart} starting={false} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Ride Your Time.");
    expect(screen.getByText("당신의 시간을 달리다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("영어에서는 슬로건을 그대로 쓰고 한국어 병기를 숨긴다", async () => {
    i18n.addResourceBundle("en", "dashboard", enDashboard, true, true);
    await i18n.changeLanguage("en");
    render(<HomeBrandIntro layout="banner" onStart={() => {}} starting={false} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Ride Your Time.");
    expect(screen.queryByText("당신의 시간을 달리다.")).not.toBeInTheDocument();
    expect(screen.getByTestId("home-brand-intro").querySelectorAll("p")).toHaveLength(1);
  });
});
