import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { NativePowerTwelvePersonalView, type NativePowerTwelveViewProps } from "./NativePowerTwelvePersonalView";
import { nativeTwelveFixture } from "../../../dev/nativeTwelveFixture";
const periods=[{id:"recent",fromInclusiveMs:0,toExclusiveMs:Date.UTC(2026,9,13)},{id:"all",fromInclusiveMs:0,toExclusiveMs:Date.UTC(2026,9,13)}];
const props=():NativePowerTwelveViewProps=>({activities:[{activityId:"orider_fixture_a",title:"합성 라이딩",headBinding:"a"}],selectedIds:[],inspectedIds:[],periods,response:null,busy:false,failure:false,enabled:true,onSelect:vi.fn(),onInspect:vi.fn(),onLoad:vi.fn(),onPeriods:vi.fn()});
describe("NativePowerTwelvePersonalView",()=>{
 it("does not inspect or load on mount, unit, duration, table or selection",()=>{const p=props();render(<MemoryRouter><NativePowerTwelvePersonalView {...p}/></MemoryRouter>);const selects=screen.getAllByRole("combobox");fireEvent.change(selects[0]!,{target:{value:"60"}});fireEvent.change(selects[1]!,{target:{value:"W/kg"}});fireEvent.click(screen.getByRole("checkbox"));expect(p.onSelect).toHaveBeenCalledOnce();expect(p.onInspect).not.toHaveBeenCalled();expect(p.onLoad).not.toHaveBeenCalled();});
 it("requires manual inspection before calculation",()=>{const p=props();p.selectedIds=["orider_fixture_a"];render(<MemoryRouter><NativePowerTwelvePersonalView {...p}/></MemoryRouter>);expect(screen.getByRole("button",{name:"선택 활동 분석"})).toBeDisabled();fireEvent.click(screen.getByRole("button",{name:"기록 확인"}));expect(p.onInspect).toHaveBeenCalledWith("orider_fixture_a");});
 it("shows twelve slots, separate origins and unknown clock without fabricated 60minute value",()=>{const p=props();p.response=nativeTwelveFixture(periods);render(<MemoryRouter><NativePowerTwelvePersonalView {...p}/></MemoryRouter>);expect(screen.getAllByRole("row")).toHaveLength(13);expect(screen.getAllByText(/계정 전체의 최고 기록은 아닙니다/)).toHaveLength(1);expect(screen.getByText(/원본 시계와 센서 구간의 정확성/)).toBeInTheDocument();fireEvent.change(screen.getAllByRole("combobox")[0]!,{target:{value:"3600"}});expect(screen.getAllByText("확인 불가").length).toBeGreaterThanOrEqual(2);});
 it("labels UTC dates and parses day boundaries without shifting to the Korean calendar",()=>{
  const p=props();p.periods=[{id:"custom",fromInclusiveMs:Date.parse("2026-10-11T23:30:00Z"),toExclusiveMs:Date.parse("2026-10-12T00:00:00Z")}];
  render(<MemoryRouter><NativePowerTwelvePersonalView {...p}/></MemoryRouter>);
  expect(screen.getByText("UTC 날짜 기준 · 종료 날짜 포함 · 오늘은 조회 시각까지")).toBeInTheDocument();
  const start=screen.getByLabelText("시작 날짜"),end=screen.getByLabelText("종료 날짜");
  expect(start).toHaveValue("2026-10-11");expect(end).toHaveValue("2026-10-11");
  fireEvent.change(start,{target:{value:"2026-10-10"}});
  expect(p.onPeriods).toHaveBeenLastCalledWith([{...p.periods[0]!,fromInclusiveMs:Date.UTC(2026,9,10)}]);
  fireEvent.change(end,{target:{value:"2026-10-10"}});
  expect(p.onPeriods).toHaveBeenLastCalledWith([{...p.periods[0]!,toExclusiveMs:Date.UTC(2026,9,11)}]);
  expect(p.onInspect).not.toHaveBeenCalled();expect(p.onLoad).not.toHaveBeenCalled();
 });

});
