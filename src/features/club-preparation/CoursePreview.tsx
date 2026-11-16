import { mt } from "./meetingText";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Mountain, Pencil, Route } from "lucide-react";
import { Card, Chip, IconButton } from "../../theme/components";
import type { Meeting } from "./domain";
import ClubCourseMap from "./ClubCourseMap";
import "./coursePreview.css";
import { checkpointTypeLabel } from "./checkpointPresentation";
import { MeetingSegmentCards } from "./MeetingSegments";
import { ICON_SIZE } from "../../theme/tokens/icon";
import InfoTip from "../../components/InfoTip";

export function CourseSummary({ meeting }: { meeting: Meeting }) {
  const basis = meeting.courseSource?.kind === "segments"
    ? mt("선택 구간 합계로 자동 입력하며 직접 보정할 수 있어요. 연결 이동 미포함 · 겹치는 구간도 각각 더합니다.")
    : mt("상단 거리·획득고도는 주최자가 작성한 모집 안내 기준입니다.") +
      (meeting.courseTrack ? mt(" 가져온 경로의 수치와 다를 수 있습니다.") : "");
  return (
    <div className="cp-course-summary" aria-label={mt("코스 거리와 획득고도")}>
      <div>
        <span>
          <Route size={ICON_SIZE.md} />
          <InfoTip title={mt("거리")} content={basis} label={mt("거리")}>{mt("거리")}</InfoTip>
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
          <InfoTip title={mt("획득고도")} content={basis} label={mt("획득고도")}>{mt("획득고도")}</InfoTip>
        </span>
        <strong>
          {meeting.elevationGainM === undefined
            ? mt("미정")
            : meeting.elevationGainM.toLocaleString("ko-KR")}
          <small>{meeting.elevationGainM === undefined ? "" : " m"}</small>
        </strong>
      </div>
      <p>{meeting.pace || mt("운영 속도는 추후 안내해요.")}</p>
    </div>
  );
}

export default function CoursePreview({
  meeting,
  onEdit,
  onConfirmCourse,
  onPrepareCourse,
  descriptionMode = "full",
}: {
  meeting: Meeting;
  onEdit?: () => void;
  /** 주행 경로가 없을 때 코스를 준비할 수 있는 사람이면 지도 자리 안내를 누르면 코스 준비 칸으로 데려간다. */
  onPrepareCourse?: () => void;
  /** 코스 확정 권한이 있을 때 「최종 코스 준비 중」 칩을 누르면 확정 칸으로 데려간다. */
  onConfirmCourse?: () => void;
  descriptionMode?: "full" | "course-only";
}) {
  const [pendingNoteOpen, setPendingNoteOpen] = useState(false);
  const { i18n } = useTranslation();
  const english = i18n.language.startsWith("en");
  const checkpoints = [...(meeting.courseCheckpoints ?? [])].sort(
    (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
  );
  const stops = meeting.courseStops?.length
    ? meeting.courseStops
    : [meeting.place, mt("주요 경유지 준비 중")];
  return (
    <Card className="cp-course-preview" aria-label={mt("코스 소개와 코스맵")}>
      <div className="cp-section-heading">
        <div className="cp-heading-with-edit">
          <h2>{mt("이런 길을 함께 달려요")}</h2>
          {/* 코스 수정은 카드 하단 행 버튼 대신 제목 옆 연필 아이콘으로 둔다. */}
          {onEdit && (
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={mt("코스 소개·GPX 수정")}
              title={mt("코스 소개·GPX 수정")}
              icon={<Pencil size={ICON_SIZE.sm} />}
              onClick={onEdit}
            />
          )}
        </div>
        {meeting.courseReady ? (
          <Chip variant="success">{mt("코스 안내")}</Chip>
        ) : (
          // 경고 칩은 눌러서 해결(주최자: 확정 칸으로 이동)하거나 확인(참가자: 안내 펼침)할 수 있어야 한다.
          <Chip
            variant="warning"
            onClick={
              onConfirmCourse ?? (() => setPendingNoteOpen((open) => !open))
            }
            aria-expanded={onConfirmCourse ? undefined : pendingNoteOpen}
            aria-controls={onConfirmCourse ? undefined : "cp-course-pending-note"}
            title={onConfirmCourse ? mt("코스 확정하러 가기") : undefined}
          >
            {mt("최종 코스 준비 중")}
            {onConfirmCourse && <ChevronRight size={ICON_SIZE.sm} aria-hidden />}
          </Chip>
        )}
      </div>
      {!meeting.courseReady && !onConfirmCourse && pendingNoteOpen && (
        <p id="cp-course-pending-note" className="cp-muted" role="status">
          {mt(
            "주최자가 아직 최종 코스를 확정하지 않았어요. 확정되면 모임 안내로 알려드려요.",
          )}
        </p>
      )}
      <p>
        {meeting.courseHighlights ||
          (descriptionMode === "full" ? meeting.description : "") ||
          mt("함께 달릴 코스의 특징과 보급 장소를 준비하고 있어요.")}
      </p>
      <ClubCourseMap meeting={meeting} onPrepareCourse={onPrepareCourse} />
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
            {checkpoints.some((point) => point.source === "segments") && (
              <p className="cp-muted">
                <InfoTip
                  title={english ? "Cumulative segment distance" : "선택 구간 누적 거리"}
                  content={english ? "Checkpoint distances add the selected segments in order; connecting travel is excluded." : "지점의 거리는 선택 구간을 순서대로 더한 값이며 연결 이동은 포함하지 않습니다."}
                  label={english ? "Cumulative segment distance" : "선택 구간 누적 거리"}
                >
                  {english ? "Cumulative segment distance" : "선택 구간 누적 거리"}
                </InfoTip>
              </p>
            )}
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
      <MeetingSegmentCards segments={meeting.segments} onEdit={onEdit} />
    </Card>
  );
}
