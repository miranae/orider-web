import { mt } from "./meetingText";
import { useEffect, useRef, useState } from "react";
import { Button, Chip } from "../../theme/components";
import { Field, Input, Textarea } from "../../theme/components/Input";
import type { CourseCheckpoint, Meeting } from "./domain";
import {
  loadCourseCatalogPage,
  toCoursePlan,
  type SavedCourseChoice,
} from "./courseCatalog";
import {
  applyCoursePlan,
  readGpxCoursePlan,
  readSegmentCoursePlan,
  type CoursePlan,
} from "./meetingCoursePlan";
import MeetingSegmentPicker from "./MeetingSegments";
import type { MeetingSegment } from "./segmentCatalog";
import "./coursePreparation.css";
import {
  checkpointDistanceValue,
  checkpointTypeLabel,
} from "./checkpointPresentation";
type ImportPlan = CoursePlan & { courseHighlights?: string };
type Mode = "saved-course" | "gpx" | "segments";
const metric = (value: number | undefined, unit: string) =>
  value === undefined
    ? mt("미정")
    : `${Number(value.toFixed(2)).toLocaleString()}${unit}`;
export default function CoursePreparation({
  meeting,
  onChange,
  onBusyChange,
}: {
  meeting: Meeting;
  onChange: (meeting: Meeting) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [mode, setMode] = useState<Mode>(
    meeting.courseSource?.kind ?? "saved-course",
  );
  const [browsingCourses, setBrowsingCourses] = useState(
    meeting.courseSource?.kind !== "saved-course",
  );
  const [courses, setCourses] = useState<SavedCourseChoice[] | null>(null);
  const [query, setQuery] = useState("");
  const courseCursor = useRef<Awaited<ReturnType<typeof loadCourseCatalogPage>>["cursor"]>(null);
  const [hasMoreCourses, setHasMoreCourses] = useState(false);
  const coursePending = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<ImportPlan | null>(null);
  const [preserveManual, setPreserveManual] = useState(true);
  const [checkpointEditing, setCheckpointEditing] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const latest = useRef(meeting);
  latest.current = meeting;
  const readVersion = useRef(0);
  const confirmation = useRef<HTMLElement>(null);
  useEffect(() => {
    if (pending) {
      confirmation.current?.focus({ preventScroll: true });
      confirmation.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [pending]);
  const commit = (plan: ImportPlan, keepManual = preserveManual) => {
    const current = latest.current;
    const next = applyCoursePlan(current, plan);
    const manual = keepManual
      ? (current.courseCheckpoints ?? []).filter(
          (point) => point.source === "manual",
        )
      : [];
    if ((next.courseCheckpoints?.length ?? 0) + manual.length > 100) {
      setError(
        mt(
          "체크포인트는 100개까지 보관할 수 있어요. 직접 추가한 지점 유지 여부를 확인해주세요.",
        ),
      );
      return;
    }
    const combinedPoints = [
      ...(next.courseCheckpoints ?? []).filter(
        (point) => point.source !== "manual",
      ),
      ...manual,
    ].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    onChange({
      ...next,
      courseHighlights:
        current.courseHighlights ||
        plan.courseHighlights ||
        next.courseHighlights,
      courseCheckpoints: combinedPoints,
      courseStops: combinedPoints.map((point) => point.name),
    });
    if (plan.source.kind === "saved-course") setBrowsingCourses(false);
    setWarnings(plan.warnings ?? []);
    setPending(null);
    setError("");
  };
  const request = (plan: ImportPlan) => {
    setError("");
    const current = latest.current;
    if (
      current.courseSource ||
      current.distanceKm !== undefined ||
      current.elevationGainM !== undefined ||
      current.courseStops?.length ||
      current.courseCheckpoints?.length ||
      current.segments?.length ||
      current.courseTrack
    ) {
      setPreserveManual(true);
      setPending(plan);
    } else commit(plan);
  };
  const changeSegments = (segments: MeetingSegment[]) => {
    const current = latest.current;
    if (current.courseSource?.kind !== "segments") {
      request(readSegmentCoursePlan(segments));
      return;
    }
    const courseData = (items: MeetingSegment[]) =>
      items.map(({ id, name, distance, elevationGain, geometry }) => ({
        id,
        name,
        distance,
        elevationGain,
        geometry,
      }));
    // 진행 방식·안내만 고칠 때는 주최자가 보정한 수치와 체크포인트를 보존한다.
    if (
      JSON.stringify(courseData(current.segments ?? [])) ===
      JSON.stringify(courseData(segments))
    )
      onChange({ ...current, segments });
    else {
      const plan = readSegmentCoursePlan(segments);
      plan.checkpoints = plan.checkpoints.map((point) => {
        const existing = current.courseCheckpoints?.find(
          (item) =>
            item.source === "segments" &&
            item.segmentId === point.segmentId &&
            item.segmentEndpoint === point.segmentEndpoint,
        );
        return existing
          ? {
              ...point,
              name: existing.name,
              type: existing.type,
              note: existing.note,
            }
          : point;
      });
      commit(plan, true);
    }
  };
  const load = async (append = false) => {
    if (coursePending.current) return;
    coursePending.current = true;
    setLoading(true);
    setError("");
    try {
      const page = await loadCourseCatalogPage(append ? courseCursor.current : null);
      courseCursor.current = page.cursor;
      setHasMoreCourses(page.hasMore);
      setCourses(previous => append ? [...new Map([...(previous ?? []), ...page.items].map(item => [item.id, item])).values()] : page.items);
    } catch {
      setError(mt("기존 코스를 불러오지 못했어요. 다시 시도해주세요."));
    } finally {
      coursePending.current = false;
      setLoading(false);
    }
  };
  const upload = async (file?: File) => {
    const version = ++readVersion.current;
    if (!file) return;
    setError("");
    setLoading(true);
    onBusyChange(true);
    try {
      if (file.size > 2_000_000)
        throw new Error(mt("GPX 파일은 2MB 이하로 올려주세요."));
      const text = await file.text();
      if (version !== readVersion.current) return;
      request(readGpxCoursePlan(text, file.name));
    } catch (failure) {
      if (version === readVersion.current)
        setError(
          failure instanceof Error
            ? failure.message
            : mt("GPX를 읽지 못했어요."),
        );
    } finally {
      if (version === readVersion.current) {
        setLoading(false);
        onBusyChange(false);
      }
    }
  };
  const checkpoints = meeting.courseCheckpoints ?? [];
  const changePoints = (points: CourseCheckpoint[]) =>
    onChange({
      ...meeting,
      courseCheckpoints: points,
      courseStops: points.map((point) => point.name),
    });
  const hits =
    courses
      ?.filter((course) =>
        `${course.name} ${course.description ?? ""}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
      )
      .slice(0, 15) ?? [];
  return (
    <section
      className="cp-course-preparation"
      aria-label={mt("코스 먼저 준비")}
    >
      <div>
        <span className="cp-eyebrow">{mt("1. 코스부터 준비해요")}</span>
        <h2>{mt("어떤 코스로 달릴까요?")}</h2>
        <p className="cp-muted">
          {mt(
            "기존 코스를 가져오거나 GPX·세그먼트로 함께 달릴 길을 준비하세요.",
          )}
        </p>
      </div>
      <div
        className="cp-course-modes"
        role="tablist"
        aria-label={mt("코스 준비 방법")}
      >
        {(
          [
            ["saved-course", mt("기존 코스 가져오기")],
            ["gpx", mt("GPX로 준비하기")],
            ["segments", mt("세그먼트로 준비하기")],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => {
              readVersion.current++;
              onBusyChange(false);
              setLoading(false);
              setPending(null);
              if (
                value === "saved-course" &&
                meeting.courseSource?.kind !== "saved-course"
              )
                setBrowsingCourses(true);
              setMode(value);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "saved-course" && (
        <div className="cp-stack">
          <p className="cp-muted">
            {mt("공개 코스의 거리·획득고도·체크포인트를 함께 가져옵니다.")}
          </p>
          {!browsingCourses ? (
            <Button
              variant="outline"
              onClick={() => {
                setBrowsingCourses(true);
                if (courses === null) void load();
              }}
            >
              {mt("다른 코스 찾기")}
            </Button>
          ) : courses === null ? (
            <Button
              variant="outline"
              loading={loading}
              onClick={() => void load()}
            >
              {mt("기존 코스 불러오기")}
            </Button>
          ) : (
            <>
              <Field
                label={mt("기존 코스 이름 검색")}
                htmlFor="saved-course-search"
              >
                <Input
                  id="saved-course-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={mt("함께 달릴 코스 이름")}
                />
              </Field>
              {hits.length === 0 && (
                <p className="cp-muted">
                  {mt("찾는 코스가 없어요. 다른 이름으로 찾아보세요.")}
                </p>
              )}
              <ul className="cp-saved-courses">
                {hits.map((course) => (
                  <li key={course.id}>
                    <div>
                      <strong>{course.name}</strong>
                      <p className="cp-muted">
                        {metric(course.distanceKm, "km")} ·{" "}
                        {metric(course.elevationGainM, "m")}
                        {mt("· 체크포인트")}
                        {course.checkpoints.length}
                        {mt("개")}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() =>
                        request({
                          ...toCoursePlan(course),
                          courseHighlights: course.description,
                        })
                      }
                    >
                      {mt("이 코스 가져오기")}
                    </Button>
                  </li>
                ))}
              </ul>
              {hasMoreCourses && <Button variant="outline" loading={loading} onClick={() => void load(true)}>{mt("더보기")}</Button>}
            </>
          )}
        </div>
      )}
      {mode === "gpx" && (
        <div className="cp-stack">
          <Field
            label={mt("코스 GPX 첨부")}
            htmlFor="meeting-gpx"
            hint={mt(
              "거리·획득고도·체크포인트와 이 모임용 주행·오르막 구간을 준비합니다.",
            )}
          >
            <Input
              id="meeting-gpx"
              type="file"
              accept=".gpx,application/gpx+xml"
              onChange={(event) => {
                void upload(event.target.files?.[0]);
              }}
            />
          </Field>
          {loading && (
            <p role="status">{mt("GPX 코스와 구간을 생성하고 있어요.")}</p>
          )}
          <p className="cp-muted">
            {mt(
              "생성 구간은 이 모임에 보관합니다. 공식 세그먼트로 게시하지 않습니다.",
            )}
          </p>
        </div>
      )}
      {mode === "segments" && (
        <>
          <p className="cp-muted">
            {mt(
              "선택하면 거리·획득고도 합계와 실제 출발·도착 지점을 자동으로 가져옵니다. 합계는 연결 이동을 제외하며 겹치는 구간도 각각 더합니다.",
            )}
          </p>
          <MeetingSegmentPicker
            selected={(meeting.segments ?? []).filter(
              (segment) => segment.source === "public-catalog",
            )}
            onChange={changeSegments}
            onBusyChange={onBusyChange}
          />
        </>
      )}
      {error && !pending && (
        <div className="cp-error" role="alert">
          {error}
          {mode === "saved-course" && (
            <Button size="sm" onClick={() => void load()}>
              {mt("코스 다시 불러오기")}
            </Button>
          )}
        </div>
      )}
      {meeting.courseSource && (
        <div className="cp-imported-summary" role="status">
          <div className="cp-section-heading">
            <strong>{meeting.courseSource.name}</strong>
            <Chip>
              {meeting.courseSource.kind === "gpx"
                ? mt("GPX에서 준비")
                : meeting.courseSource.kind === "saved-course"
                  ? mt("기존 코스")
                  : mt("구간으로 준비")}
            </Chip>
          </div>
          <p>
            {meeting.courseSource.kind === "segments"
              ? mt("선택 구간 합계 · ")
              : ""}
            {metric(meeting.distanceKm, "km")} ·{" "}
            {metric(meeting.elevationGainM, "m")}
            {mt("· 체크포인트")}
            {checkpoints.length}
            {mt("개")}
          </p>
          {meeting.segments?.some((segment) => segment.source === "gpx") && (
            <p className="cp-muted">
              {mt("이 모임용 생성 구간")}
              {
                meeting.segments.filter((segment) => segment.source === "gpx")
                  .length
              }
              {mt("개 · 주행")}
              {
                meeting.segments.filter(
                  (segment) => segment.segmentKind === "route",
                ).length
              }
              {mt("/ 오르막")}
              {
                meeting.segments.filter(
                  (segment) => segment.segmentKind === "climb",
                ).length
              }
            </p>
          )}
        </div>
      )}
      {warnings.map((warning, index) => (
        <p className="cp-notice" key={`${index}-${mt(warning)}`}>
          {mt(warning)}
        </p>
      ))}
      <details className="cp-divider" open={checkpointEditing}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            setCheckpointEditing((value) => !value);
          }}
        >
          {mt("체크포인트 확인·수정 (")}
          {checkpoints.length}
          {mt("개)")}
        </summary>
        {checkpointEditing && (
          <div className="cp-stack">
            {checkpoints.map((point, index) => (
              <article className="cp-checkpoint-editor" key={index}>
                <div className="cp-form-grid">
                  <Field
                    label={mt("체크포인트 이름")}
                    htmlFor={`checkpoint-name-${index}`}
                  >
                    <Input
                      id={`checkpoint-name-${index}`}
                      maxLength={300}
                      value={point.name}
                      onChange={(event) =>
                        changePoints(
                          checkpoints.map((item, i) =>
                            i === index
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field
                    label={mt("유형")}
                    htmlFor={`checkpoint-type-${index}`}
                  >
                    <Input
                      id={`checkpoint-type-${index}`}
                      maxLength={100}
                      placeholder={mt("보급, 카페, 재집결 등")}
                      value={checkpointTypeLabel(point.type)}
                      onChange={(event) =>
                        changePoints(
                          checkpoints.map((item, i) =>
                            i === index
                              ? { ...item, type: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field
                    label={mt("출발부터 거리 (km)")}
                    htmlFor={`checkpoint-distance-${index}`}
                  >
                    <Input
                      id={`checkpoint-distance-${index}`}
                      type="number"
                      min="0"
                      step="any"
                      value={checkpointDistanceValue(point.distanceKm)}
                      onChange={(event) =>
                        changePoints(
                          checkpoints.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  distanceKm:
                                    event.target.value === ""
                                      ? undefined
                                      : Number(event.target.value),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </Field>
                </div>
                <Field
                  label={mt("체크포인트 메모")}
                  htmlFor={`checkpoint-note-${index}`}
                >
                  <Textarea
                    id={`checkpoint-note-${index}`}
                    maxLength={3000}
                    value={point.note ?? ""}
                    onChange={(event) =>
                      changePoints(
                        checkpoints.map((item, i) =>
                          i === index
                            ? { ...item, note: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </Field>
                {point.offTrackM !== undefined && (
                  <p className="cp-muted">
                    {mt("경로와 약")}
                    {Math.round(point.offTrackM)}
                    {mt("m 떨어진 지점")}
                  </p>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    changePoints(checkpoints.filter((_, i) => i !== index))
                  }
                >
                  {mt("체크포인트 삭제")}
                </Button>
              </article>
            ))}
            <Button
              variant="outline"
              disabled={checkpoints.length >= 100}
              onClick={() =>
                changePoints([
                  ...checkpoints,
                  { name: mt("새 체크포인트"), source: "manual" },
                ])
              }
            >
              {mt("체크포인트 추가")}
            </Button>
          </div>
        )}
      </details>
      {pending && (
        <section
          ref={confirmation}
          tabIndex={-1}
          className="cp-import-confirm"
          role="region"
          aria-label={mt("코스 변경 확인")}
        >
          <h3>{mt("작성한 코스 안내를 바꿀까요?")}</h3>
          {error && (
            <p className="cp-error" role="alert">
              {error}
            </p>
          )}
          <p className="cp-muted">
            {pending.source.kind === "segments"
              ? mt(
                  "선택한 구간의 거리·획득고도 합계와 출발·도착 지점으로 바꿉니다. 기존 전체 경로는 제거되며 연결 이동은 합계에 포함되지 않습니다.",
                )
              : mt(
                  "가져온 코스의 경로·수치·체크포인트·주요 구간으로 기존 코스 안내를 교체합니다.",
                )}
            {mt("모임 이름·날짜·집결 정보는 유지됩니다.")}
          </p>
          <dl className="cp-review-summary">
            <div>
              <dt>{mt("코스")}</dt>
              <dd>
                {mt("이전:")}
                {meeting.courseSource?.name ?? mt("직접 작성")}
                <br />
                {mt("가져올 코스:")}
                {pending.source.name}
              </dd>
            </div>
            <div>
              <dt>{mt("거리·획고")}</dt>
              <dd>
                {mt("이전:")}
                {metric(meeting.distanceKm, "km")} ·{" "}
                {metric(meeting.elevationGainM, "m")}
                <br />
                {mt("가져올 값:")}
                {metric(pending.distanceKm, "km")} ·{" "}
                {metric(pending.elevationGainM, "m")}
              </dd>
            </div>
            <div>
              <dt>{mt("경로")}</dt>
              <dd>
                {mt("이전:")}
                {meeting.courseTrack ? mt("경로 있음") : mt("경로 없음")}
                {mt("/ 가져올 경로:")}
                {pending.track ? mt("경로 있음") : mt("경로 없음")}
              </dd>
            </div>
            <div>
              <dt>{mt("주요 구간")}</dt>
              <dd>
                {mt("기존")}
                {meeting.segments?.length ?? 0}
                {mt("개 → 가져올 구간")}
                {pending.segments.length}
                {mt(
                  "개. 기존 구간별 진행 방식과 설명도 새 구간 안내로 교체됩니다.",
                )}
              </dd>
            </div>
            <div>
              <dt>{mt("체크포인트")}</dt>
              <dd>
                {mt("기존")}
                {checkpoints.length}
                {mt("개 / 가져올")}
                {pending.checkpoints.length}
                {mt("개")}
              </dd>
            </div>
          </dl>
          {pending.source.kind === "gpx" && (
            <p>
              {mt("생성할 구간 · 주행")}
              {
                pending.segments.filter(
                  (segment) => segment.segmentKind === "route",
                ).length
              }
              {mt("개 / 오르막")}
              {
                pending.segments.filter(
                  (segment) => segment.segmentKind === "climb",
                ).length
              }
              {mt("개")}
            </p>
          )}
          <label className="cp-date-check">
            <input
              type="checkbox"
              checked={preserveManual}
              onChange={(event) => setPreserveManual(event.target.checked)}
            />
            {mt("직접 추가한 체크포인트 유지")}
          </label>
          <div className="cp-actions">
            <Button
              onClick={() => {
                setPending(null);
                setError("");
              }}
            >
              {mt("변경 취소")}
            </Button>
            <Button variant="primary" onClick={() => commit(pending)}>
              {mt("확인하고 적용")}
            </Button>
          </div>
        </section>
      )}
    </section>
  );
}
