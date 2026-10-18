import { useTranslation } from "react-i18next";
import { mt } from "./meetingText";
import { useEffect, useRef, useState } from "react";
import { Button, Chip } from "../../theme/components";
import { Field, Input, Select, Textarea } from "../../theme/components/Input";
import {
  loadSegmentCatalog,
  loadSegmentDetail,
  searchSegments,
  segmentDetailHref,
  segmentDistance,
  selectSegment,
  type MeetingSegment,
  type SegmentChoice,
} from "./segmentCatalog";
import "./meetingSegments.css";
function SegmentMetrics({ segment: s }: { segment: SegmentChoice }) {
  return (
    <dl className="cp-segment-metrics">
      <div>
        <dt>{mt("거리")}</dt>
        <dd>{segmentDistance(s)}</dd>
      </div>
      <div>
        <dt>{mt("획득고도")}</dt>
        <dd>
          {s.elevationGain === undefined
            ? "—"
            : `${s.elevationGain.toLocaleString()} m`}
        </dd>
      </div>
      <div>
        <dt>{mt("평균 경사")}</dt>
        <dd>
          {s.averageGrade === undefined
            ? "—"
            : `${Number(s.averageGrade.toFixed(1))}%`}
        </dd>
      </div>
    </dl>
  );
}
export function MeetingSegmentCards({
  segments,
  onEdit,
}: {
  segments?: MeetingSegment[];
  onEdit?: () => void;
}) {
  const { i18n } = useTranslation();
  return (
    <section className="cp-segments" aria-label={mt("주요 구간")}>
      <div className="cp-section-heading">
        <h3>{mt("주요 구간")}</h3>
        {onEdit && (
          <Button size="sm" variant="ghost" onClick={onEdit}>
            {mt("구간 선택·수정")}
          </Button>
        )}
      </div>
      <p className="cp-muted">
        {segments?.some((segment) => segment.source === "gpx")
          ? mt(
              "GPX에서 이 모임용으로 생성한 주행·오르막 구간입니다. 공식 세그먼트로 게시되지 않습니다. ",
            )
          : ""}
        {mt(
          "구간 거리는 전체 코스 거리와 별개입니다. 공개 목록에서 선택한 구간은 코스 포함 여부가 검증되지 않았으며 최신 상태는 해당 상세에서 확인하세요.",
        )}
      </p>
      {!segments?.length ? (
        <p className="cp-muted">
          {mt("아직 연결한 구간이 없어요.")}
          {onEdit
            ? mt(" 기존 세그먼트를 찾아 라이딩의 주요 구간을 소개해보세요.")
            : mt(" 주최자가 구간을 선택하면 여기에서 확인할 수 있어요.")}
        </p>
      ) : (
        segments.map((s) => (
          <article className="cp-segment-card" key={s.id}>
            <div className="cp-section-heading">
              <strong>{s.name}</strong>
              <Chip variant="accent">{mt(s.mode)}</Chip>
              {s.source === "gpx" && (
                <Chip>
                  {s.segmentKind === "climb" ? mt("오르막") : mt("주행")}
                  {mt("· 이 모임용 생성 구간")}
                </Chip>
              )}
            </div>
            <SegmentMetrics segment={s} />
            {s.instruction && <p>{s.instruction}</p>}
            {s.source === "public-catalog" && (
              <a
                href={segmentDetailHref(s.id, i18n.language)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {mt("기존 세그먼트 상세 보기 (새 탭) ↗")}
              </a>
            )}
          </article>
        ))
      )}
    </section>
  );
}
export default function MeetingSegmentPicker({
  selected,
  onChange,
  onBusyChange,
}: {
  selected: MeetingSegment[];
  onChange: (segments: MeetingSegment[]) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [catalog, setCatalog] = useState<SegmentChoice[] | null>(null);
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  useEffect(() => {
    busyCallback.current?.(Boolean(selecting));
  }, [selecting]);
  useEffect(
    () => () => {
      busyCallback.current?.(false);
    },
    [],
  );
  const latest = useRef({ selected, onChange });
  latest.current = { selected, onChange };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const choose = async (choice: SegmentChoice) => {
    if (selecting) return;
    try {
      selectSegment(latest.current.selected, choice);
    } catch (error) {
      setSelectionError((error as Error).message);
      return;
    }
    const selectionAtStart = latest.current.selected
      .map((item) => item.id)
      .join(",");
    setSelecting(choice.id);
    setSelectionError("");
    let enriched: SegmentChoice | null = choice;
    let warning = "";
    try {
      enriched = await loadSegmentDetail(choice);
    } catch {
      warning = mt(
        "상세 정보를 불러오지 못해 공개 목록의 거리와 경로를 가져왔어요. 획고는 확인 후 입력해주세요.",
      );
    }
    if (!mounted.current) return;
    if (
      latest.current.selected.map((item) => item.id).join(",") !==
      selectionAtStart
    ) {
      setSelecting(null);
      return;
    }
    try {
      if (!enriched)
        throw new Error(
          mt("더 이상 공개되지 않은 구간이에요. 다른 구간을 선택해주세요."),
        );
      latest.current.onChange(selectSegment(latest.current.selected, enriched));
      setSelectionError(warning);
    } catch (error) {
      setSelectionError((error as Error).message);
    } finally {
      setSelecting(null);
    }
  };
  const refresh = async (segment: MeetingSegment) => {
    if (selecting) return;
    setSelecting(segment.id);
    setSelectionError("");
    try {
      const catalogChoice =
        catalog?.find((item) => item.id === segment.id) ??
        (await loadSegmentCatalog()).find((item) => item.id === segment.id);
      let enriched: SegmentChoice | null = catalogChoice ?? segment;
      let warning = "";
      try {
        enriched = await loadSegmentDetail(enriched);
      } catch {
        warning = mt(
          "상세 정보를 불러오지 못해 공개 목록의 거리와 경로만 갱신했어요. 획고는 확인 후 입력해주세요.",
        );
      }
      if (!mounted.current) return;
      if (!enriched) throw new Error(mt("더 이상 공개되지 않은 구간이에요."));
      if (latest.current.selected.some((item) => item.id === segment.id)) {
        latest.current.onChange(
          latest.current.selected.map((item) =>
            item.id === segment.id ? { ...item, ...enriched } : item,
          ),
        );
        setSelectionError(warning);
      }
    } catch {
      if (mounted.current)
        setSelectionError(
          mt("구간 정보를 다시 가져오지 못했어요. 기존 선택은 유지됩니다."),
        );
    } finally {
      if (mounted.current) setSelecting(null);
    }
  };
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setLoading(true);
    setLoadError("");
    loadSegmentCatalog()
      .then((data) => {
        if (current) setCatalog(data);
      })
      .catch(() => {
        if (current)
          setLoadError(
            mt("공개 세그먼트 목록을 불러오지 못했어요. 다시 시도해주세요."),
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [enabled, retry]);
  const hits = catalog ? searchSegments(catalog, query) : [];
  const move = (index: number, delta: number) => {
    const next = [...selected];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };
  return (
    <section className="cp-segments" aria-label={mt("주요 구간 편집")}>
      <h3>{mt("기존 세그먼트로 코스 소개")}</h3>
      <p className="cp-muted">
        {mt(
          "이름·지역으로 공개 구간을 찾아 선택하세요. 코스 포함 여부는 자동 검증하지 않습니다.",
        )}
      </p>
      {!enabled ? (
        <Button variant="outline" onClick={() => setEnabled(true)}>
          {mt("기존 세그먼트 찾기")}
        </Button>
      ) : (
        <>
          <Field label={mt("세그먼트 이름·지역 검색")} htmlFor="segment-search">
            <Input
              id="segment-search"
              placeholder={mt("예: 남산, 정선, 행주")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          {loading && (
            <p role="status">{mt("공개 세그먼트를 불러오고 있어요.")}</p>
          )}
          {loadError && (
            <div role="alert" className="cp-notice">
              <p>{loadError}</p>
              <Button size="sm" onClick={() => setRetry((n) => n + 1)}>
                {mt("다시 불러오기")}
              </Button>
            </div>
          )}
          {catalog?.length === 0 && (
            <p>{mt("공개된 세그먼트가 아직 없어요.")}</p>
          )}
          {catalog && catalog.length > 0 && !query.trim() && (
            <p className="cp-muted">
              {mt("검색어를 입력하면 공개 구간을 보여드려요.")}
            </p>
          )}
          {catalog && query.trim() && !hits.length && (
            <p className="cp-muted">
              {mt("검색 결과가 없어요. 다른 이름이나 지역으로 찾아보세요.")}
            </p>
          )}
          <ul className="cp-segment-results">
            {hits.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <p className="cp-muted">
                    {[s.state, s.city].filter(Boolean).join(" ")} ·{" "}
                    {segmentDistance(s)}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={
                    Boolean(selecting) ||
                    selected.some((item) => item.id === s.id)
                  }
                  onClick={() => {
                    void choose(s);
                  }}
                >
                  {selecting === s.id
                    ? mt("정보 가져오는 중")
                    : selected.some((item) => item.id === s.id)
                      ? mt("선택됨")
                      : mt("구간 선택")}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      {selectionError && (
        <p role="alert" className="cp-notice">
          {selectionError}
        </p>
      )}
      {selected.map((s, index) => (
        <article className="cp-segment-card" key={s.id}>
          <div className="cp-section-heading">
            <strong>
              {index + 1}. {s.name}
            </strong>
            <div className="cp-actions">
              <Button
                size="sm"
                variant="ghost"
                disabled={!index}
                aria-label={`${s.name} ${mt("위로")}`}
                onClick={() => move(index, -1)}
              >
                {mt("위로")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={index === selected.length - 1}
                aria-label={`${s.name} ${mt("아래로")}`}
                onClick={() => move(index, 1)}
              >
                {mt("아래로")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`${s.name} ${mt("제거")}`}
                onClick={() => onChange(selected.filter((x) => x.id !== s.id))}
              >
                {mt("제거")}
              </Button>
            </div>
          </div>
          <SegmentMetrics segment={s} />
          {s.source === "public-catalog" && (
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(selecting)}
              onClick={() => {
                void refresh(s);
              }}
            >
              {selecting === s.id
                ? mt("정보 가져오는 중")
                : mt("구간 정보 다시 가져오기")}
            </Button>
          )}
          <Field label={mt("구간 진행 방식")} htmlFor={`segment-mode-${s.id}`}>
            <Select
              id={`segment-mode-${s.id}`}
              value={s.mode}
              onChange={(e) =>
                onChange(
                  selected.map((x) =>
                    x.id === s.id
                      ? { ...x, mode: e.target.value as MeetingSegment["mode"] }
                      : x,
                  ),
                )
              }
            >
              {["함께", "오픈", "재집결", "현장 협의"].map((mode) => (
                <option key={mode} value={mode}>
                  {mt(mode)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={mt("주최자의 구간 안내")}
            htmlFor={`segment-note-${s.id}`}
          >
            <Textarea
              id={`segment-note-${s.id}`}
              maxLength={1000}
              value={s.instruction}
              onChange={(e) =>
                onChange(
                  selected.map((x) =>
                    x.id === s.id ? { ...x, instruction: e.target.value } : x,
                  ),
                )
              }
              placeholder={mt(
                "예: 정상에서 재집결해요. 내리막에서는 간격을 유지해주세요.",
              )}
            />
          </Field>
        </article>
      ))}
    </section>
  );
}
