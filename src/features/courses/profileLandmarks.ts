export interface CourseProfilePoint {
  distance: number;
  elevation: number;
}

export interface CourseProfileLandmark extends CourseProfilePoint {
  index: number;
  prominence: number;
}

export type ProfileAnnotationEdge = "left" | "center" | "right";

export interface ProfileAnnotationPlacement {
  row: number;
  edge: ProfileAnnotationEdge;
  translatePercent: number;
  connectorPath: string;
}

/**
 * 가장자리 카드는 레일 안쪽으로 정렬하되, 연결선 끝은 실제 고점 X에 유지한다.
 * 10% 경계는 840px 연결형 레이아웃에서 8rem 카드를 보호하면서 고점의 실제 X를 최대한 유지한다.
 */
export function profileAnnotationPlacement(index: number, ratio: number): ProfileAnnotationPlacement {
  const row = index === 0 || index === 3 ? 0 : index === 1 || index === 4 ? 1 : 2;
  if (ratio <= 0.1) {
    return { row, edge: "left", translatePercent: 0, connectorPath: "M64 0 L0 100" };
  }
  if (ratio >= 0.9) {
    return { row, edge: "right", translatePercent: -100, connectorPath: "M64 0 L128 100" };
  }
  return { row, edge: "center", translatePercent: -50, connectorPath: "M64 0 L64 100" };
}

interface IndexedProfilePoint extends CourseProfilePoint {
  index: number;
}

function finiteProfile(data: readonly CourseProfilePoint[]): IndexedProfilePoint[] {
  return data
    .map((point, index) => ({ ...point, index }))
    .filter((point) => Number.isFinite(point.distance) && Number.isFinite(point.elevation))
    .filter((point, index, points) => index === 0 || point.distance > points[index - 1]!.distance);
}

/**
 * 저장된 climb 정보에는 코스상의 위치가 없으므로, 프로필 자체에서 실제 국소 고점만 고른다.
 * prominence와 최소 거리 간격을 함께 사용해 잔노이즈가 주요 고점 패널을 독점하지 않게 한다.
 */
export function selectProminentProfilePeaks(
  data: readonly CourseProfilePoint[],
  limit = 5,
): CourseProfileLandmark[] {
  if (limit <= 0) return [];
  const points = finiteProfile(data);
  if (points.length < 3) return [];

  const totalDistance = points[points.length - 1]!.distance - points[0]!.distance;
  if (!(totalDistance > 0)) return [];
  const searchRadius = totalDistance * 0.12;
  const edgeInset = totalDistance * 0.06;
  const minimumSeparation = totalDistance * 0.12;

  const candidates: CourseProfileLandmark[] = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]!;
    if (point.elevation < points[index - 1]!.elevation || point.elevation <= points[index + 1]!.elevation) continue;
    if (point.distance - points[0]!.distance < edgeInset || points[points.length - 1]!.distance - point.distance < edgeInset) continue;

    let leftMinimum = point.elevation;
    for (let cursor = index - 1; cursor >= 0 && point.distance - points[cursor]!.distance <= searchRadius; cursor -= 1) {
      leftMinimum = Math.min(leftMinimum, points[cursor]!.elevation);
    }
    let rightMinimum = point.elevation;
    for (let cursor = index + 1; cursor < points.length && points[cursor]!.distance - point.distance <= searchRadius; cursor += 1) {
      rightMinimum = Math.min(rightMinimum, points[cursor]!.elevation);
    }

    candidates.push({
      index: point.index,
      distance: point.distance,
      elevation: point.elevation,
      prominence: point.elevation - Math.max(leftMinimum, rightMinimum),
    });
  }

  return candidates
    .sort((a, b) => b.prominence - a.prominence || b.elevation - a.elevation || a.distance - b.distance)
    .reduce<CourseProfileLandmark[]>((selected, candidate) => {
      if (selected.length >= limit) return selected;
      if (selected.some((peak) => Math.abs(peak.distance - candidate.distance) < minimumSeparation)) return selected;
      selected.push(candidate);
      return selected;
    }, [])
    .sort((a, b) => a.distance - b.distance);
}

export function profileGradeBand(
  from: CourseProfilePoint,
  to: CourseProfilePoint,
): "flat" | "rolling" | "steep" {
  const deltaDistance = to.distance - from.distance;
  if (!(deltaDistance > 0)) return "flat";
  const grade = Math.abs(((to.elevation - from.elevation) / deltaDistance) * 100);
  if (grade < 3) return "flat";
  if (grade < 7) return "rolling";
  return "steep";
}
