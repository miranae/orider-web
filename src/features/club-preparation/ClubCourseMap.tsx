import { mt } from "./meetingText";
import { useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import RouteMap from "../../components/RouteMap";
import { Button } from "../../theme/components";
import ElevationChart, {
  ELEVATION_PLOT_AXIS_WIDTH,
} from "../../components/ElevationChart";
import {
  classifyLane,
  LANE_DEFS,
  lanesForContext,
  laneLabelKey,
  readLaneColor,
} from "../courseEngine/waypointLanes";
import { waypointPipAnchorStyle } from "../courses/courseWaypoints";
import "../event/detail/event-profile.css";
import type { Meeting } from "./domain";
import {
  clubVisualParts,
  profileCheckpoint,
  profileMapPosition,
} from "./clubCourseVisual";
export default function ClubCourseMap({ meeting }: { meeting: Meeting }) {
  const { t } = useTranslation("course");
  const parts = useMemo(
    () => clubVisualParts(meeting),
    [meeting.courseTrack, meeting.segments],
  );
  const [selectedId, setSelectedId] = useState("");
  const [hover, setHover] = useState<{ id: string; index: number } | null>(
    null,
  );
  const [chosenPoint, setChosenPoint] = useState<number | null>(null);
  const [fullRange, setFullRange] = useState<{
    startIndex: number;
    endIndex: number;
  } | null>(null);
  const active = parts.find((part) => part.id === selectedId) ?? parts[0];
  const checkpoints = meeting.courseCheckpoints ?? [];
  const routeParts = useMemo(
    () =>
      parts.map((part) =>
        part.points.map((point) => [point.lat, point.lon] as [number, number]),
      ),
    [parts],
  );
  const laneFor = (point: (typeof checkpoints)[number]) =>
    classifyLane({ name: point.name, type: point.type ?? "" });
  const waypoints = checkpoints.flatMap((point, index) =>
    point.lat === undefined || point.lon === undefined
      ? []
      : [
          {
            lat: point.lat,
            lon: point.lon,
            name: point.name,
            icon: (
              <span
                className="cp-map-pin"
                style={{ background: LANE_DEFS[laneFor(point)].color }}
              >
                {LANE_DEFS[laneFor(point)].icon}
              </span>
            ),
            active: chosenPoint === index,
          },
        ],
  );
  const highlighted =
    hover && active?.id === hover.id ? active.profile[hover.index] : undefined;
  const marker =
    highlighted && active
      ? profileMapPosition(active, highlighted.distance)
      : null;
  const point = chosenPoint === null ? null : checkpoints[chosenPoint];
  const flyTo =
    point?.lat !== undefined && point.lon !== undefined
      ? ([point.lat, point.lon] as [number, number])
      : null;
  if (!active)
    return (
      <div className="cp-course-map-empty">
        <strong>{mt("주행 경로를 준비해주세요")}</strong>
        <p>
          {mt(
            "코스나 GPX를 가져오거나 좌표가 있는 세그먼트를 선택하면 지도와 고도표를 확인할 수 있어요.",
          )}
        </p>
      </div>
    );
  const markers = checkpoints.flatMap((checkpoint, index) => {
    const position = profileCheckpoint(active, checkpoint);
    return position
      ? [
          {
            ...position,
            color: readLaneColor(laneFor(checkpoint)),
            label: `${index + 1}. ${checkpoint.name}`,
            active: chosenPoint === index,
          },
        ]
      : [];
  });
  const checkpointProfile = checkpoints.flatMap((checkpoint, index) => {
    const position = profileCheckpoint(active, checkpoint);
    return position
      ? [
          {
            ...position,
            index,
            name: checkpoint.name,
            lane: laneFor(checkpoint),
          },
        ]
      : [];
  });
  const selectPoint = (index: number) => {
    setFullRange(null);
    setChosenPoint(index);
    const checkpoint = checkpoints[index]!;
    const part =
      parts.find((item) => item.id === checkpoint.segmentId) ??
      parts.find((item) => profileCheckpoint(item, checkpoint));
    if (part) setSelectedId(part.id);
    setHover(null);
  };
  return (
    <section className="cp-course-visual" aria-label={mt("코스 지도와 고도표")}>
      <div className="cp-section-heading">
        <h3>{mt("코스맵")}</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setChosenPoint(null);
            setHover(null);
            setFullRange({
              startIndex: 0,
              endIndex:
                routeParts.reduce((sum, part) => sum + part.length, 0) - 1,
            });
          }}
        >
          {mt("전체 경로 보기")}
        </Button>
      </div>
      <div className="cp-real-map" aria-label={mt("실제 주행 경로 지도")}>
        <RouteMap
          routeParts={routeParts}
          height="cp-map-height"
          interactive
          showRouteEndpoints
          waypoints={waypoints}
          markerPosition={marker}
          flyToPosition={flyTo}
          flyToRange={fullRange}
          fitPadding={40}
          routeLineWidth={4}
        />
      </div>
      {parts.length > 1 && (
        <>
          <p className="cp-muted">
            {mt("경로")}
            {parts.length}
            {mt("개를 각각 표시합니다. 경로 사이 이동은 연결하지 않습니다.")}
          </p>
          <div className="cp-profile-tabs" aria-label={mt("고도표 구간 선택")}>
            {parts.map((part) => (
              <button
                type="button"
                key={part.id}
                aria-pressed={active.id === part.id}
                onClick={() => {
                  setSelectedId(part.id);
                  setHover(null);
                }}
              >
                {part.name}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="cp-elevation-profile">
        <div className="cp-section-heading">
          <h3>{mt("고도표")}</h3>
          <span className="cp-muted">{active.name}</span>
        </div>
        {active.profile.length >= 2 ? (
          <>
            <ElevationChart
              data={active.profile}
              height={200}
              colorByGrade
              reserveLaneGutter
              markers={markers}
              onHoverIndex={(index) =>
                setHover(index === null ? null : { id: active.id, index })
              }
            />
            {checkpointProfile.length > 0 && (
              <div
                className="event-lanes cp-profile-lanes"
                style={
                  {
                    "--profile-axis-width": `${ELEVATION_PLOT_AXIS_WIDTH}px`,
                  } as CSSProperties
                }
              >
                {lanesForContext("course").flatMap((lane) =>
                  checkpointProfile
                    .filter((item) => item.lane === lane)
                    .map((item) => {
                      const start = active.profile[0]!.distance;
                      const span =
                        active.profile[active.profile.length - 1]!.distance -
                        start;
                      const distance = `${Number((item.distance / 1000).toFixed(2))}km`;
                      return (
                        <div key={item.index} className="event-lane-row">
                          <span className="event-lane-name">
                            <i style={{ background: LANE_DEFS[lane].color }} />
                            {t(laneLabelKey(lane, "course"))}
                          </span>
                          <span className="event-lane-track">
                            <button
                              type="button"
                              className="event-pip"
                              aria-label={`${item.name} · ${distance} ${mt("지도에서 경유지 보기")}`}
                              title={`${item.name} · ${distance}`}
                              aria-pressed={chosenPoint === item.index}
                              data-selected={
                                chosenPoint === item.index ? "1" : undefined
                              }
                              style={waypointPipAnchorStyle(
                                span > 0 ? (item.distance - start) / span : 0,
                              )}
                              onClick={() => selectPoint(item.index)}
                            >
                              <i
                                style={{ background: LANE_DEFS[lane].color }}
                              />
                              <span>{item.index + 1}</span>
                              <span className="event-pip-km">{distance}</span>
                            </button>
                          </span>
                        </div>
                      );
                    }),
                )}
              </div>
            )}
            <p className="cp-muted">
              {mt("프로필의 거리 위치를 가리키면 지도에서도 확인할 수 있어요.")}
            </p>
          </>
        ) : (
          <p className="cp-muted">
            {mt(
              "이 경로에는 확인된 고도 데이터가 없어요. 획득고도 수치만으로 고도표를 만들지 않습니다.",
            )}
          </p>
        )}
      </div>
      {checkpoints.length > 0 && (
        <div
          className="cp-map-waypoints"
          aria-label={mt("지도에서 경유지 보기")}
        >
          {checkpoints.map((checkpoint, index) => (
            <button
              type="button"
              key={index}
              disabled={
                checkpoint.lat === undefined || checkpoint.lon === undefined
              }
              aria-pressed={chosenPoint === index}
              onClick={() => selectPoint(index)}
            >
              <span
                style={{ background: LANE_DEFS[laneFor(checkpoint)].color }}
              >
                {LANE_DEFS[laneFor(checkpoint)].icon}
              </span>
              <span className="cp-waypoint-name">
                {checkpoint.name}
                <small>
                  {t(laneLabelKey(laneFor(checkpoint), "course"))} ·{" "}
                  {checkpoint.distanceKm === undefined
                    ? mt("거리 미정")
                    : `${Number(checkpoint.distanceKm.toFixed(2))}km`}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
