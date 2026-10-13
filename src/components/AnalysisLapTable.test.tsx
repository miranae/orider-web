import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import koActivity from "../i18n/resources/ko/activity.json";
import { AnalysisLapTable } from "./AnalysisTab";

const state = vi.hoisted(() => ({ units: "metric" as "metric" | "imperial" }));
vi.mock("../contexts/LocaleContext", () => ({ useLocale: () => ({ units: state.units }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key.split(".").reduce<unknown>((node, part) => node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined, koActivity) ?? key }) }));
afterEach(() => { cleanup(); state.units = "metric"; });

// 앱 LapManager는 km/h를 평균하고 업로더가 avgSpeed에 그대로 보존한다.
const lap = { number: 1, durationMs: 360000, distanceKm: 1, avgSpeed: 3600 / 300, avgHeartRate: 151, avgCadence: 88, avgPower: 240 };

describe("기록 랩 종목 표시", () => {
  it("러닝은 기록 평균 속도의 페이스를 우선하며 사이클 FTP와 RPM을 제거한다", () => {
    render(<AnalysisLapTable laps={[lap]} ftp={200} sport="run" />);
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "페이스" })).toBeInTheDocument();
    expect(table).toHaveTextContent("5:00/km");
    expect(table).toHaveTextContent("6:00");
    expect(table).toHaveTextContent("151");
    expect(table).toHaveTextContent("240W");
    expect(table).not.toHaveTextContent(/FTP|RPM|120%|176/);
    expect(within(table).getByRole("columnheader", { name: "기록 케이던스 (회/분)" })).toBeInTheDocument();
    expect(screen.getByText(/휴식 포함 여부/)).toHaveTextContent("한 발");
  });

  it("마일 설정은 속도 역수와 기록 시간·거리 fallback 모두 마일 페이스로 바꾼다", () => {
    state.units = "imperial";
    render(<AnalysisLapTable laps={[lap, { ...lap, number: 2, avgSpeed: undefined }]} ftp={null} sport="run" />);
    expect(screen.getByRole("table")).toHaveTextContent("8:03/mi");
    expect(screen.getByRole("table")).toHaveTextContent("9:39/mi");
    expect(screen.getAllByText("0.62 mi")).toHaveLength(2);
    expect(screen.getByRole("table")).not.toHaveTextContent(/\/km|mph/);
  });

  it("누락되거나 잘못된 시간·거리는 페이스를 만들지 않는다", () => {
    render(<AnalysisLapTable laps={[{ durationMs: NaN, distanceKm: 1 }, { durationMs: 300000, distanceKm: 0 }, { durationMs: -1, distanceKm: 1 }, { durationMs: 300000, distanceKm: Infinity }]} ftp={null} sport="run" />);
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    rows.forEach(row => expect(within(row).getAllByRole("cell")[3]).toHaveTextContent("—"));
    expect(screen.getByRole("table")).not.toHaveTextContent("NaN");
  });

  it("종목 기본값의 사이클 속도·파워·FTP·RPM은 유지한다", () => {
    render(<AnalysisLapTable laps={[lap]} ftp={200} />);
    const table = screen.getByRole("table");
    expect(table).toHaveTextContent("12.0 km/h");
    expect(table).toHaveTextContent("240W");
    expect(table).toHaveTextContent("120%");
    expect(within(table).getByRole("columnheader", { name: "RPM" })).toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "페이스" })).not.toBeInTheDocument();
  });

  it.each([['metric', '30.0 km/h'], ['imperial', '18.6 mph']] as const)("앱 km/h 랩 평균 속도를 한 번만 단위 변환한다 %s", (units, expected) => {
    state.units = units;
    render(<AnalysisLapTable laps={[{ ...lap, avgSpeed: 30 }]} ftp={200} sport="ride" />);
    expect(screen.getByRole("table")).toHaveTextContent(expected);
    expect(screen.getByRole("table")).not.toHaveTextContent("108.0");
  });

  it("반올림 경계 페이스는 4:60 대신 다음 분으로 올린다", () => {
    render(<AnalysisLapTable laps={[{ ...lap, avgSpeed: 3600 / 299.7 }]} ftp={null} sport="run" />);
    expect(screen.getByRole("table")).toHaveTextContent("5:00/km");
    expect(screen.getByRole("table")).not.toHaveTextContent("4:60");
  });
});
