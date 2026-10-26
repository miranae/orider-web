import { useNavigate } from "react-router-dom";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { createMockActivity } from "../../__tests__/fixtures/mockData";
import AthletePublicPeriodExplorer from "./AthletePublicPeriodExplorer";
const state = vi.hoisted(()=>({status:"partial",items:[] as unknown[],more:vi.fn(),refresh:vi.fn()}));
vi.mock("../../hooks/useAthletePublicPeriod", async importOriginal=>({...await importOriginal<typeof import("../../hooks/useAthletePublicPeriod")>(),useAthletePublicPeriod:()=>({...state,valid:true})}));
vi.mock("./AthleteActivityChart",()=>({default:()=> <div>completed-period-chart</div>}));
beforeEach(()=>{state.status="partial";state.items=[];vi.clearAllMocks();});
it("keeps empty intermediate pages explicitly incomplete and allows one more page",()=>{
 renderWithProviders(<AthletePublicPeriodExplorer targetUid="owner"/>);
 expect(screen.getByRole("status")).toHaveTextContent("아직 확인할 페이지");
 expect(screen.queryByText("completed-period-chart")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"다음 페이지 확인"})); expect(state.more).toHaveBeenCalledOnce();
});
it("shows a completed period and original link without claiming all-time totals",()=>{
 state.status="complete";state.items=[createMockActivity({id:"public-record",description:"확인한 원본 활동"})];
 renderWithProviders(<AthletePublicPeriodExplorer targetUid="owner"/>, {route:"/ko/athlete/owner?profileFrom=2026-01-01&profileTo=2026-01-31"});
 expect(screen.getByRole("status")).toHaveTextContent("현재 조회의 마지막 페이지");
 expect(screen.getByText("completed-period-chart")).toBeInTheDocument();
 expect(screen.getByRole("link",{name:"원본 활동 보기 · 확인한 원본 활동"})).toHaveAttribute("href","/ko/activity/public-record");
 expect(screen.getByLabelText("시작일")).toHaveValue("2026-01-01");
});

it("synchronizes edited date fields after URL navigation and keeps original activity return dates",()=>{
 function Navigation(){const navigate=useNavigate();return <><button onClick={()=>navigate("/ko/athlete/owner?profileFrom=2025-02-01&profileTo=2025-02-28")}>Another period</button><AthletePublicPeriodExplorer targetUid="owner"/></>;}
 renderWithProviders(<Navigation/>,{route:"/ko/athlete/owner?profileFrom=2026-01-01&profileTo=2026-01-31"});
 fireEvent.change(screen.getByLabelText("시작일"),{target:{value:"2026-01-02"}});
 fireEvent.click(screen.getByRole("button",{name:"Another period"}));
 expect(screen.getByLabelText("시작일")).toHaveValue("2025-02-01"); expect(screen.getByLabelText("종료일")).toHaveValue("2025-02-28");
});
