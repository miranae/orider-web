import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import ExplorePage from "./ExplorePage";
const { mapProps, fitBounds } = vi.hoisted(() => ({ mapProps:vi.fn(), fitBounds:vi.fn() }));
vi.mock("../utils/mapbox", () => ({getMapboxToken:()=>"test-token",MAP_STYLE:"test-style",DEFAULT_VIEW:{latitude:36.5,longitude:127.5,zoom:7},applyKoreaCyclingStyle:vi.fn()}));
vi.mock("react-map-gl/mapbox",()=>({default:(props: {children:React.ReactNode})=>{mapProps(props);return <div>{props.children}</div>;},Source:()=>null,Layer:()=>null,Popup:()=>null,useMap:()=>({current:{fitBounds}})}));
vi.mock("../components/explore/HeatmapLayer",()=>({default:()=>null}));
vi.mock("../components/explore/PersonalHeatmapLayer",()=>({default:()=>null}));
vi.mock("../components/explore/ExplorationGridLayer",()=>({default:()=>null}));
vi.mock("../hooks/useExplorationGrid",()=>({useExplorationGrid:()=>({result:{tiles:[],tileCount:383,maxSquare:4},loading:false,error:false})}));
beforeEach(()=>{
 mapProps.mockClear();fitBounds.mockClear();
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,headers:{get:()=>"application/json"},json:async()=>({v:1,count:1,segments:[{id:"world",name:"Global climb",distance:10000,averageGrade:5,maximumGrade:10,elevationHigh:600,elevationLow:100,climbCategory:4,startLatlng:[46,10],gh:"u0p"}]})})));
});
it("keeps the Korean default viewport while retaining global segment data",async()=>{
 renderWithProviders(<ExplorePage/>,{route:"/explore/segments"});
 await waitFor(()=>expect(mapProps).toHaveBeenCalled());
 expect(mapProps.mock.lastCall?.[0].initialViewState).toEqual({latitude:36.5,longitude:127.5,zoom:7});
 expect(fitBounds).not.toHaveBeenCalled();
 expect(screen.getByText("Global climb")).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"세그먼트 검색"})).toBeInTheDocument();
 expect(screen.getByRole("textbox",{name:"세그먼트 이름 또는 지역"})).toBeInTheDocument();
});
it("honors an explicit shared viewport instead of fitting all global segments",async()=>{
 renderWithProviders(<ExplorePage/>,{route:"/explore/segments?c=12.5,46.2&z=11"});
 await waitFor(()=>expect(mapProps).toHaveBeenCalled());
 expect(mapProps.mock.lastCall?.[0].initialViewState).toEqual({longitude:12.5,latitude:46.2,zoom:11});
 expect(fitBounds).not.toHaveBeenCalled();
});

it("explains the existing private-grid totals with a bounded recorded-period basis",async()=>{
 renderWithProviders(<ExplorePage/>,{route:"/explore/segments",authenticated:true});
 fireEvent.click(await screen.findByTestId("E2-1-3"));
 const tiles = screen.getByRole("button",{name:"방문 타일 383개"});
 fireEvent.mouseEnter(tiles);
 const tooltip = await screen.findByRole("tooltip");
 expect(tooltip).toHaveTextContent("최근 12개월");
 expect(tooltip).toHaveTextContent("최대 500개");
 expect(tooltip).toHaveTextContent("같은 칸은 한 번만");
 fireEvent.keyDown(document,{key:"Escape"});
 fireEvent.mouseEnter(screen.getByRole("button",{name:"맥스 스퀘어 4×4"}));
 expect(await screen.findByRole("tooltip")).toHaveTextContent("빈칸 없이");
 expect(screen.getByRole("tooltip")).toHaveTextContent("가로 4칸·세로 4칸");
});
