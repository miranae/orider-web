// @vitest-environment jsdom
import { fireEvent,render,screen,cleanup } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import ClubCourseMap from './ClubCourseMap';
import {createSeed} from './domain';
const captured=vi.hoisted(()=>({map:{} as Record<string,unknown>,chart:{} as Record<string,unknown>}));
vi.mock('../../components/RouteMap',()=>({default:(props:Record<string,unknown>)=>{captured.map=props;return <div>실제 지도</div>;}}));
vi.mock('../../components/ElevationChart',()=>({ELEVATION_PLOT_AXIS_WIDTH:54,default:(props:Record<string,unknown>)=>{captured.chart=props;return <button onClick={()=>(props.onHoverIndex as (i:number)=>void)(1)}>고도 위치 가리키기</button>;}}));
afterEach(cleanup);
describe('모임 코스 지도와 고도표',()=>{
  it('기존 지도·고도 컴포넌트에 분리 경로와 실제 프로필·지점을 전달하고 위치를 연동한다',()=>{
    const meeting={...createSeed().meetings[2]!,courseTrack:{fileName:'real.gpx',distanceKm:2,segmentStarts:[0,2],points:[{lat:37,lon:127,ele:0},{lat:37.01,lon:127,ele:100},{lat:38,lon:128,ele:900},{lat:38.01,lon:128,ele:950}]},courseCheckpoints:[{name:'정상',lat:37.01,lon:127,source:'gpx' as const}]};
    render(<ClubCourseMap meeting={meeting}/>);expect(captured.map.routeParts).toEqual([[[37,127],[37.01,127]],[[38,128],[38.01,128]]]);expect(captured.map.interactive).toBe(true);expect(captured.chart.markers).toEqual([expect.objectContaining({label:'1. 정상',elevation:100})]);
    fireEvent.click(screen.getByRole('button',{name:'고도 위치 가리키기'}));expect(captured.map.markerPosition).toEqual([37.01,127]);
    fireEvent.click(screen.getByRole('button',{name:'주행 경로 2'}));expect(captured.chart.data).toEqual([expect.objectContaining({distance:0,elevation:900}),expect.objectContaining({elevation:950})]);expect(captured.map.markerPosition).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:/정상.*거리 미정/}));expect(captured.map.flyToPosition).toEqual([37.01,127]);
  });
  it('가까운 동일 유형 경유지를 각 레인에 두고 거리 위치와 전체 이름을 유지한다',()=>{
    const meeting={...createSeed().meetings[2]!,courseTrack:{fileName:'ride',distanceKm:100,points:[{lat:37,lon:127},{lat:37.01,lon:127}],elevationProfile:[{distance:0,elevation:0},{distance:100000,elevation:100}]},courseCheckpoints:[{name:'첫 보급소',type:'FOOD',lat:37,lon:127,distanceKm:26.83,source:'course' as const},{name:'다음 보급소',type:'FOOD',lat:37.01,lon:127,distanceKm:27,source:'course' as const}]};
    render(<ClubCourseMap meeting={meeting}/>);const first=screen.getByRole('button',{name:'첫 보급소 · 26.83km 지도에서 경유지 보기'});const second=screen.getByRole('button',{name:'다음 보급소 · 27km 지도에서 경유지 보기'});
    expect(first.closest('.event-lane-row')).not.toBe(second.closest('.event-lane-row'));expect(first.style.left).toBe('26.83%');expect(second.style.left).toBe('27%');expect(first.textContent).toContain('26.83km');expect(first.title).toBe('첫 보급소 · 26.83km');
    fireEvent.click(first);expect(captured.map.flyToPosition).toEqual([37,127]);
  });
  it('경유지 확대와 프로필 탐색 후 전체 경로를 다시 볼 수 있고 반복 요청도 전달한다',()=>{
    const meeting={...createSeed().meetings[2]!,courseTrack:{fileName:'real.gpx',distanceKm:1,points:[{lat:37,lon:127,ele:0},{lat:37.01,lon:127,ele:100}]},courseCheckpoints:[{name:'정상',lat:37.01,lon:127,source:'gpx' as const}]};
    render(<ClubCourseMap meeting={meeting}/>);fireEvent.click(screen.getByRole('button',{name:/정상.*거리 미정/}));expect(captured.map.flyToPosition).toEqual([37.01,127]);
    fireEvent.click(screen.getByRole('button',{name:'고도 위치 가리키기'}));expect(captured.map.markerPosition).toEqual([37.01,127]);
    fireEvent.click(screen.getByRole('button',{name:'전체 경로 보기'}));expect(captured.map.flyToPosition).toBeNull();expect(captured.map.markerPosition).toBeNull();expect(captured.map.flyToRange).toEqual({startIndex:0,endIndex:1});expect(captured.map.fitPadding).toBe(40);
    const firstRequest=captured.map.flyToRange;fireEvent.click(screen.getByRole('button',{name:'전체 경로 보기'}));expect(captured.map.flyToRange).toEqual(firstRequest);expect(captured.map.flyToRange).not.toBe(firstRequest);
    fireEvent.click(screen.getByRole('button',{name:/정상.*거리 미정/}));expect(captured.map.flyToRange).toBeNull();expect(captured.map.flyToPosition).toEqual([37.01,127]);
  });
  it('좌표·실제 고도 정보가 없으면 개요도나 고도표를 꾸미지 않는다',()=>{
    const view=render(<ClubCourseMap meeting={createSeed().meetings[2]!}/>);expect(screen.getByText('주행 경로를 준비해주세요')).toBeTruthy();
    view.rerender(<ClubCourseMap meeting={{...createSeed().meetings[2]!,courseTrack:{fileName:'no-elevation',distanceKm:1,elevationGainM:400,points:[{lat:37,lon:127},{lat:37.01,lon:127}]}}}/>);expect(screen.getByText(/확인된 고도 데이터가 없어요/)).toBeTruthy();expect(screen.queryByRole('button',{name:'고도 위치 가리키기'})).toBeNull();
  });
});
