import { cumulativeDistances, haversineMeters } from '../courseEngine/geo';
import type { CourseCheckpoint, CoursePoint, Meeting } from './domain';
export type ClubVisualPart = {id: string; name: string; points: CoursePoint[]; profile: {distance: number; elevation: number}[]; courseDistanceM?: number};
export function clubVisualParts(meeting: Meeting): ClubVisualPart[] {
  if (meeting.courseTrack) {
    const track = meeting.courseTrack;
    const starts = track.segmentStarts?.length ? track.segmentStarts : [0];
    return starts.map((start,index) => {
      const points = track.points.slice(start, starts[index + 1]);
      const distances = cumulativeDistances(points);
      const profile = starts.length === 1 && track.elevationProfile ? track.elevationProfile : points.every(point => point.ele !== undefined) ? points.map((point,i) => ({distance:distances[i]!,elevation:point.ele!})) : [];
      return {id:`track-${index}`,name:starts.length === 1 ? track.fileName : `주행 경로 ${index + 1}`,points,profile,courseDistanceM:starts.length===1?track.distanceKm*1000:undefined};
    }).filter(part => part.points.length >= 2);
  }
  return (meeting.segments ?? []).filter(segment => segment.geometry && segment.geometry.length >= 2).map(segment => {
    const points=segment.geometry!;const distances=cumulativeDistances(points);
    return {id:segment.id,name:segment.name,points,profile:segment.elevationProfile ?? (points.every(point=>point.ele!==undefined)?points.map((point,i)=>({distance:distances[i]!,elevation:point.ele!})):[])};
  });
}
/** 프로필과 경로의 샘플 수가 달라도 누적 거리 비율로 같은 위치를 찾는다. */
export function profileMapPosition(part: ClubVisualPart, distance: number): [number,number] | null {
  if (!part.points.length || part.profile.length < 2) return null;
  const start=part.profile[0]!.distance;const span=part.profile[part.profile.length-1]!.distance-start;
  if (!(span>0)) return null;
  const distances=cumulativeDistances(part.points);const total=distances[distances.length-1]!;
  const target=Math.max(0,Math.min(1,(distance-start)/span))*total;
  const next=distances.findIndex(value=>value>=target);
  if (next<=0) return [part.points[0]!.lat,part.points[0]!.lon];
  const previous=part.points[next-1]!;const current=part.points[next]!;
  const ratio=(target-distances[next-1]!)/(distances[next]!-distances[next-1]!||1);
  return [previous.lat+(current.lat-previous.lat)*ratio,previous.lon+(current.lon-previous.lon)*ratio];
}
export function profileCheckpoint(part: ClubVisualPart, point: CourseCheckpoint): {distance:number;elevation:number} | null {
  if (point.source === 'segments' && point.segmentId && point.segmentId !== part.id) return null;
  if (point.lat===undefined||point.lon===undefined||part.profile.length<2) return null;
  let closest=0;let separation=Infinity;
  part.points.forEach((location,index)=>{const distance=haversineMeters(location.lat,location.lon,point.lat!,point.lon!);if(distance<separation){closest=index;separation=distance;}});
  if(separation>150) return null;
  const distances=cumulativeDistances(part.points);const total=distances[distances.length-1]!;
  if(!(total>0)) return null;
  const start=part.profile[0]!.distance;const end=part.profile[part.profile.length-1]!.distance;
  const routeRatio=point.segmentEndpoint==='start'?0:point.segmentEndpoint==='end'?1:distances[closest]!/total;
  // 저장 코스/단일 GPX의 경유지 거리는 이미 같은 거리축에 저장된 정본이다.
  const distance=part.courseDistanceM!==undefined&&point.distanceKm!==undefined?point.distanceKm*1000:start+routeRatio*(end-start);
  if(distance<start||distance>end) return null;
  const next=Math.max(1,part.profile.findIndex(sample=>sample.distance>=distance));
  const before=part.profile[next-1]!;const after=part.profile[next]!;
  const ratio=(distance-before.distance)/(after.distance-before.distance||1);
  return {distance,elevation:before.elevation+(after.elevation-before.elevation)*ratio};
}
