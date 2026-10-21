import { mt } from "./meetingText";
import { Mountain, Route } from "lucide-react";
import { Card, Button, Chip } from "../../theme/components";
import type { Meeting } from "./domain";
import ClubCourseMap from "./ClubCourseMap";
import "./coursePreview.css";
import { checkpointTypeLabel } from "./checkpointPresentation";
import { MeetingSegmentCards } from "./MeetingSegments";
import { ICON_SIZE } from "../../theme/tokens/icon";

export function CourseSummary({ meeting }: { meeting: Meeting }) {
  return (
    <div className="cp-course-summary" aria-label={mt("코스 거리와 획득고도")}>
      <div>
        <span>
          <Route size={ICON_SIZE.md} />
          {mt("거리")}
        </span>
        <strong>
          {meeting.distanceKm === undefined
            ? mt("미정")
            : meeting.distanceKm.toLocaleString("ko-KR")}
          <small>{meeting.distanceKm === undefined ? "" : " km"}</small>
        </strong>
      </div>
      <div>
        <span>
          <Mountain size={ICON_SIZE.md} />
          {mt("획득고도")}
        </span>
        <strong>
          {meeting.elevationGainM === undefined
            ? mt("미정")
            : meeting.elevationGainM.toLocaleString("ko-KR")}
          <small>{meeting.elevationGainM === undefined ? "" : " m"}</small>
        </strong>
      </div>
      <p>{meeting.pace || mt("운영 속도는 추후 안내해요.")}</p>
      {meeting.courseSource?.kind === "segments" && (
        <p>
          {mt(
            "선택 구간 합계로 자동 입력하며 직접 보정할 수 있어요. 연결 이동 미포함 · 겹치는 구간도 각각 더합니다.",
          )}
        </p>
      )}
    </div>
  );
}

export default function CoursePreview({
  meeting,
  onEdit,
  descriptionMode = "full",
}: {
  meeting: Meeting;
  onEdit?: () => void;
  descriptionMode?: "full" | "course-only";
}) {
  const track = meeting.courseTrack;
  const checkpoints = [...(meeting.courseCheckpoints ?? [])].sort(
    (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
  );
  const stops = meeting.courseStops?.length
    ? meeting.courseStops
    : [meeting.place, mt("주요 경유지 준비 중")];
  return (
    <Card className="cp-course-preview" aria-label={mt("코스 소개와 코스맵")}>
      <div className="cp-section-heading">
        <h2>{mt("이런 길을 함께 달려요")}</h2>
        <Chip variant={meeting.courseReady ? "success" : "warning"}>
          {meeting.courseReady ? mt("코스 안내") : mt("최종 코스 준비 중")}
        </Chip>
      </div>
      <p>
        {meeting.courseHighlights ||
          (descriptionMode === "full" ? meeting.description : "") ||
          mt("함께 달릴 코스의 특징과 보급 장소를 준비하고 있어요.")}
      </p>
      <ClubCourseMap meeting={meeting} />
      {meeting.courseSource && (
        <p className="cp-muted">
          {mt("코스 출처 ·")}
          {meeting.courseSource.name}
        </p>
      )}
      {checkpoints.length > 0 && (
        <section className="cp-stack" aria-label={mt("코스 체크포인트")}>
          <details>
            <summary>
              {mt("경유지 상세 안내 (")}
              {checkpoints.length}
              {mt("개)")}
            </summary>
            <ol className="cp-course-checkpoints">
              {checkpoints.map((point, index) => (
                <li key={index}>
                  <strong>{point.name}</strong>
                  <span className="cp-muted">
                    {checkpointTypeLabel(point.type) || mt("경유")} ·{" "}
                    {point.source === "segments" ? mt("선택 구간 누적 ") : ""}
                    {point.distanceKm === undefined
                      ? mt("거리 미정")
                      : `${Number(point.distanceKm.toFixed(2))}km`}
                  </span>
                  {point.note && <p className="cp-muted">{point.note}</p>}
                  {point.offTrackM !== undefined && (
                    <small className="cp-muted">
                      {mt("경로에서 약")}
                      {Math.round(point.offTrackM)}m
                    </small>
                  )}
                </li>
              ))}
            </ol>
          </details>
        </section>
      )}
      {checkpoints.length === 0 && (
        <ol className="cp-course-stops">
          {stops.map((stop, index) => (
            <li key={`${index}-${stop}`}>
              <span>{index + 1}</span>
              {stop}
            </li>
          ))}
        </ol>
      )}
      <p className="cp-muted">
        {meeting.courseSource?.kind === "segments" ? (
          mt(
            "상단 수치는 선택 구간 합계로 자동 입력하며 직접 보정할 수 있어요. 연결 이동은 포함하지 않고, 겹치는 구간도 각각 더합니다. 지점의 거리는 선택 구간을 순서대로 더한 값입니다.",
          )
        ) : (
          <>
            {mt("상단 거리·획득고도는 주최자가 작성한 모집 안내 기준입니다.")}
            {track ? mt(" 가져온 경로의 수치와 다를 수 있습니다.") : ""}
          </>
        )}
      </p>
      <MeetingSegmentCards segments={meeting.segments} onEdit={onEdit} />
      {onEdit && (
        <Button size="sm" variant="outline" onClick={onEdit}>
          {mt("코스 소개·GPX 수정")}
        </Button>
      )}
    </Card>
  );
}
