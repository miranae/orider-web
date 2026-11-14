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
 expect(screen.getByRole("status")).toHaveTextContent("통계를 보려면 기록을 더 불러와 주세요.");
 expect(screen.queryByText("completed-period-chart")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"더 불러오기"})); expect(state.more).toHaveBeenCalledOnce();
});
it("shows a completed chart without duplicate links or completion explanations",()=>{
 state.status="complete";state.items=[createMockActivity({id:"public-record",description:"확인한 원본 활동"})];
 renderWithProviders(<AthletePublicPeriodExplorer targetUid="owner"/>, {route:"/ko/athlete/owner?profileFrom=2026-01-01&profileTo=2026-01-31"});
 expect(screen.queryByRole("status")).not.toBeInTheDocument();
 expect(screen.getByText("completed-period-chart")).toBeInTheDocument();
 expect(screen.queryByRole("link")).not.toBeInTheDocument();
 expect(screen.getByLabelText("시작일")).toHaveValue("2026-01-01");
 expect(screen.queryByRole("button",{name:"새로고침"})).not.toBeInTheDocument();
});
it.each(["error","stale","restart"])("relies on focus re-reads instead of a refresh or retry button when %s",status=>{
 state.status=status;
 renderWithProviders(<AthletePublicPeriodExplorer targetUid="owner"/>);
 expect(screen.queryByRole("button",{name:/새로고침|다시 시도|더 불러오기/})).not.toBeInTheDocument();
});

it("synchronizes edited date fields after URL navigation and keeps original activity return dates",()=>{
 function Navigation(){const navigate=useNavigate();return <><button onClick={()=>navigate("/ko/athlete/owner?profileFrom=2025-02-01&profileTo=2025-02-28")}>Another period</button><AthletePublicPeriodExplorer targetUid="owner"/></>;}
 renderWithProviders(<Navigation/>,{route:"/ko/athlete/owner?profileFrom=2026-01-01&profileTo=2026-01-31"});
 fireEvent.change(screen.getByLabelText("시작일"),{target:{value:"2026-01-02"}});
 fireEvent.click(screen.getByRole("button",{name:"Another period"}));
 expect(screen.getByLabelText("시작일")).toHaveValue("2025-02-01"); expect(screen.getByLabelText("종료일")).toHaveValue("2025-02-28");
});

it("does not duplicate forty collected activities or show technical explanations", () => {
 state.items = Array.from({ length: 40 }, (_, index) => createMockActivity({ id: `record-${index}` }));
 renderWithProviders(<AthletePublicPeriodExplorer targetUid="owner"/>);
 expect(screen.queryAllByRole("link")).toHaveLength(0);
 expect(screen.queryByText("통계 안내")).not.toBeInTheDocument();
 expect(screen.queryByText(/합계와 차트|수집|원본 활동/)).not.toBeInTheDocument();
 expect(screen.queryByText("completed-period-chart")).not.toBeInTheDocument();
});
