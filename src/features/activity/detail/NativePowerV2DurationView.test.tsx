import {render,screen,fireEvent} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {describe,it,expect,vi} from "vitest";
import {NativePowerV2DurationView,type NativePowerV2DurationViewProps} from "./NativePowerV2DurationView";
import {nativePowerV2DurationFixture} from "../../../dev/nativePowerV2DurationFixture";
const props=():NativePowerV2DurationViewProps=>({activityId:"orider_fixture_a",draft:"300",metadata:null,result:null,busy:false,failure:false,canCalculate:false,onDraft:vi.fn(),onConfirm:vi.fn(),onCalculate:vi.fn(),onCancel:vi.fn()});
describe("V2 arbitrary-duration actual DS view",()=>{
 it("folding and draft input never trigger requests",()=>{const p=props();render(<MemoryRouter><NativePowerV2DurationView {...p}/></MemoryRouter>);fireEvent.click(screen.getByText("원하는 시간의 최대 평균 파워"));fireEvent.change(screen.getByRole("textbox"),{target:{value:"17"}});expect(p.onDraft).toHaveBeenCalledWith("17");expect(p.onConfirm).not.toHaveBeenCalled();expect(p.onCalculate).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"최대 평균 파워 계산"})).toBeDisabled();});
 it("shows unverified stored basis, elapsed window and source link without map control",()=>{const p=props();p.result=nativePowerV2DurationFixture(300,true);render(<MemoryRouter><NativePowerV2DurationView {...p}/></MemoryRouter>);expect(screen.getByText("300.0 W · 5:00")).toBeInTheDocument();expect(screen.getByText("활동 경과 2:00–7:00의 연속 구간")).toBeInTheDocument();expect(screen.getByText(/원본 시계와 센서 구간/)).toBeInTheDocument();expect(screen.getByRole("link",{name:"기록 활동 보기"})).toHaveAttribute("href","/ko/activity/orider_fixture_a");expect(screen.queryByRole("button",{name:/지도/})).not.toBeInTheDocument();});
 it("shows tiny positive W separately from truezero",()=>{const p=props();p.result=nativePowerV2DurationFixture(30,true);p.result.witness!.maxAveragePowerW=1/30;const {rerender}=render(<MemoryRouter><NativePowerV2DurationView {...p}/></MemoryRouter>);expect(screen.getByText("<0.1 W · 0:30")).toBeInTheDocument();p.result.witness!.maxAveragePowerW=0;rerender(<MemoryRouter><NativePowerV2DurationView {...p}/></MemoryRouter>);expect(screen.getByText("0.0 W · 0:30")).toBeInTheDocument();});
 it("labels a retained result with its original duration and exposes explicit history selection",()=>{
  const p=props();p.draft="600";p.result=nativePowerV2DurationFixture(300,true);p.previousResult=true;p.history=[{id:"1",duration:300,calculatedAt:1},{id:"2",duration:600,calculatedAt:2}];p.selectedResultId="1";p.selectResult=vi.fn();
  render(<MemoryRouter><NativePowerV2DurationView {...p}/></MemoryRouter>);
  expect(screen.getByText("300.0 W · 5:00")).toBeInTheDocument();expect(screen.getByText(/새 입력의 계산 결과는 아닙니다/)).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox",{name:"이 화면에서 계산한 결과"}),{target:{value:"2"}});expect(p.selectResult).toHaveBeenCalledWith("2");expect(p.onCalculate).not.toHaveBeenCalled();
 });

});
