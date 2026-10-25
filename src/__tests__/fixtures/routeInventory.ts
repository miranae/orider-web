import type { ActivityMatchedRouteInventoryResponse } from '../../services/activityMatchedRouteInventory';
export const inventoryNow=1792953000000;
export function routeInventoryPage({more=false,ids=['ride-a'],year=null}:{more?:boolean;ids?:string[];year?:number|null}={}):ActivityMatchedRouteInventoryResponse {
 return {mode:'matched_route_inventory_page',anchorActivityId:'anchor',discipline:'bike',state:'available',readTime:{seconds:inventoryNow/1000,nanoseconds:0},expiresAt:inventoryNow+1800000,groupToken:null,nextCursor:null,summary:null,
 scope:{kind:'bounded_owner_stored_index_inventory',indexQueryPolicy:'document_id_continuation_v1',groupPolicy:'anchor-pair-observation-v1',descriptorLimit:5,validatedLimit:6},
 inventory:{nextCursor:more?'mrgi1.'+'a'.repeat(40)+'.'+'b'.repeat(43):null,exhausted:!more,scannedCount:5,year,matchingBasis:'anchor_pairwise'},
 coverage:{indexCohort:more?'descriptor_capped':'exhausted',sourceValidation:'complete_in_cohort',wholeHistory:'unknown',geometry:'observed_gap_free_coverage_unproven',gpsAccuracy:'unknown',deduplication:'unknown'},
 omittedCounts:{unsupportedDescriptor:0,partialGeometry:0,gapGeometry:0,changedSource:0,validationCap:0,nonAnchorCluster:0},io:{logicalDocuments:10,metadataRequests:2,descriptorComparisons:5,rawDownloads:0,writes:0},
 members:ids.map(activityId=>({activityId,startTime:inventoryNow-86400000,year:2026,isAnchor:false,rankingEligible:false,rankingExclusionReason:'inventory_discovery_only',canonicalAverage:{state:'pending',reason:'metrics_pending',metricsRevision:null}}))};
}
