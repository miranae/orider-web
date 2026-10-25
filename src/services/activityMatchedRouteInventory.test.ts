import {expect,it} from 'vitest';
import {routeInventoryPage,inventoryNow} from '../__tests__/fixtures/routeInventory';
import {validActivityMatchedRouteInventoryRequest,validateActivityMatchedRouteInventoryResponse,validateMatchedRouteInventoryAppend} from './activityMatchedRouteInventory';
const request={mode:'matched_route_inventory_page' as const,anchorActivityId:'anchor',discipline:'bike' as const,geometryPolicy:'observed_native' as const};
it('accepts empty discovered pages with continuation without implying exhaustive history',()=>{
 const page=routeInventoryPage({more:true,ids:[]});
 expect(validateActivityMatchedRouteInventoryResponse(page,request,inventoryNow)).toBe(page);
 expect(page.coverage.wholeHistory).toBe('unknown');
});
it.each([{cursor:'mrgg1.'+'a'.repeat(40)},{inventoryCursor:'mrgg1.'+'a'.repeat(40)},{year:2026.5},{year:1969}])('rejects mixed cursor contracts and invalid year %j',patch=>{
 expect(validActivityMatchedRouteInventoryRequest({...request,...patch})).toBe(false);
});
it('rejects ranking escalation, wrong year, raw IO and forged totals',()=>{
 for(const mutate of [(p:ReturnType<typeof routeInventoryPage>)=>{p.members[0]!.rankingEligible=true;},(p:ReturnType<typeof routeInventoryPage>)=>{p.members[0]!.year=2025;},(p:ReturnType<typeof routeInventoryPage>)=>{p.io.rawDownloads=1 as 0;},(p:ReturnType<typeof routeInventoryPage>)=>{p.summary={} as never;}]){
  const page=routeInventoryPage();mutate(page);expect(()=>validateActivityMatchedRouteInventoryResponse(page,request,inventoryNow)).toThrow('invalid_matched_route_inventory_response');
 }
 const page=routeInventoryPage({year:2025});expect(()=>validateActivityMatchedRouteInventoryResponse(page,{...request,year:2025},inventoryNow)).toThrow();
});
it('binds continuation to fixed snapshot, year and unique rows',()=>{
 const first=routeInventoryPage({more:true}),next=routeInventoryPage({ids:['ride-b']});
 expect(()=>validateMatchedRouteInventoryAppend([first],next)).not.toThrow();
 expect(()=>validateMatchedRouteInventoryAppend([first],routeInventoryPage())).toThrow('continuity');
 next.readTime.seconds++;expect(()=>validateMatchedRouteInventoryAppend([first],next)).toThrow('continuity');
});
it('expires rows rather than accepting a stale snapshot',()=>{
 expect(()=>validateActivityMatchedRouteInventoryResponse(routeInventoryPage(),request,inventoryNow+1800001)).toThrow('matched_route_inventory_expired');
});
