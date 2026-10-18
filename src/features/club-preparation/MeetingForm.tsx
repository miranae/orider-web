import { mt } from "./meetingText";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../theme/components/Button";
import { Field, Input, Select, Textarea } from "../../theme/components/Input";
import type { Meeting, State } from "./domain";
import CoursePreparation from "./CoursePreparation";
import CoursePreview, { CourseSummary } from "./CoursePreview";
import { clearDraft, draftScope, readDraft, writeDraft } from "./meetingDrafts";

export default function MeetingForm({
  state,
  initial,
  onSave,
  onClose,
  draftNamespace,
  initialRevision,
  english = false,
}: {
  state: State;
  initial: Meeting;
  onSave: (m: Meeting, baseRevision?: number) => void | Promise<void>;
  onClose: () => void;
  draftNamespace?: string;
  initialRevision?: number;
  english?: boolean;
}) {
  const existing = state.meetings.some((meeting) => meeting.id === initial.id);
  const scope = draftNamespace
    ? `${draftNamespace}.${draftScope(initial, existing)}`
    : draftScope(initial, existing);
  const [recovery] = useState(() => readDraft(scope));
  const [baseRevision] = useState(recovery.baseRevision ?? initialRevision);
  const [draft, setDraft] = useState<Meeting>(() =>
    recovery.meeting
      ? {
          ...recovery.meeting,
          registrations: initial.registrations,
          notices: initial.notices,
        }
      : initial,
  );
  const [stopText, setStopText] = useState(
    (recovery.meeting ?? initial).courseStops?.join("\n") ?? "",
  );
  const [saveError, setSaveError] = useState(recovery.error ?? "");
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);
  const [dateConfirmed, setDateConfirmed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const completeDraft = (): Meeting => ({
    ...draft,
    courseInfoVersion: 1,
    courseStops: stopText
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean),
  });
  useEffect(() => {
    if (recovery.error) return;
    try {
      writeDraft(
        scope,
        {
          ...draft,
          courseInfoVersion: 1,
          courseStops: stopText
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
        },
        baseRevision,
      );
      setSaved(true);
      setSaveError("");
    } catch {
      setSaved(false);
      setSaveError(
        mt(
          "초안을 저장하지 못했어요. 입력값과 브라우저 저장 공간을 확인해주세요.",
        ),
      );
    }
  }, [draft, stopText, scope, recovery.error, baseRevision]);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (savingRef.current) return;
    if (!existing && !dateConfirmed) {
      setSaveError(mt("개최 날짜와 시각을 확인해주세요."));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await onSave(completeDraft(), baseRevision);
      clearDraft(scope);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : english
            ? "Could not save. Your draft is preserved."
            : mt("저장하지 못했어요. 초안은 보관했습니다."),
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const reviewRows = [
    { label: mt("모임 이름"), before: initial.title, after: draft.title },
    {
      label: mt("일시"),
      before: `${initial.date} ${initial.time}`,
      after: `${draft.date} ${draft.time}`,
    },
    { label: mt("집결 장소"), before: initial.place, after: draft.place },
    {
      label: mt("정원"),
      before: `${initial.capacity}${mt("명")}`,
      after: `${draft.capacity}${mt("명")}`,
    },
    { label: mt("속도·운영 강도"), before: initial.pace, after: draft.pace },
    { label: mt("우천 안내"), before: initial.weather, after: draft.weather },
    {
      label: mt("주차·현장 안내"),
      before: initial.parking,
      after: draft.parking,
    },
    {
      label: mt("합류 지점"),
      before: initial.joins
        .map((join) => `${join.time} ${join.place}`)
        .join(" / "),
      after: draft.joins
        .map((join) => `${join.time} ${join.place}`)
        .join(" / "),
    },
    {
      label: mt("코스의 매력·주의 구간"),
      before: initial.courseHighlights ?? "",
      after: draft.courseHighlights ?? "",
    },
    {
      label: mt("모집 소개"),
      before: initial.description,
      after: draft.description,
    },
  ].filter((row) => !existing || row.before !== row.after);
  const actions = (location: string) => (
    <div className={`cp-form-actions cp-form-actions--${location}`}>
      <span className="cp-muted" role="status">
        {saved
          ? mt("초안 자동 저장됨 · 아직 게시되지 않았어요")
          : mt("초안 저장 확인 중")}
      </span>
      <div className="cp-actions">
        <Button variant="outline" disabled={saving} onClick={onClose}>
          {mt("닫고 나중에 계속")}
        </Button>
        <Button
          variant="primary"
          disabled={reading || saving}
          onClick={() => {
            if (formRef.current?.reportValidity()) {
              setSaveError("");
              setPreview(true);
            }
          }}
        >
          {mt("모집글 미리보기")}
        </Button>
      </div>
    </div>
  );
  const [reading, setReading] = useState(false);
  const patch = (next: Partial<Meeting>) =>
    setDraft((value) => ({ ...value, ...next }));
  if (preview)
    return (
      <section className="cp-form-panel cp-form-preview">
        <div className="cp-section-heading">
          <div>
            <span className="cp-eyebrow">
              {existing ? mt("변경 내용 확인") : mt("게시 전 미리보기")}
            </span>
            <h2>{draft.title}</h2>
          </div>
          <Button disabled={saving} onClick={() => setPreview(false)}>
            {mt("작성으로 돌아가기")}
          </Button>
        </div>
        <div className="cp-stack">
          <p>{draft.description}</p>
          <p>
            {draft.date} {draft.time} · {draft.place}
          </p>
          <CourseSummary meeting={completeDraft()} />
          <CoursePreview meeting={completeDraft()} />
          {!existing && (
            <label className="cp-date-check">
              <input
                type="checkbox"
                disabled={saving}
                checked={dateConfirmed}
                onChange={(event) => setDateConfirmed(event.target.checked)}
              />{" "}
              {draft.date} {draft.time}
              {mt("에 개최하는 모임이 맞습니다.")}
            </label>
          )}
          <section
            className="cp-stack"
            aria-label={existing ? mt("변경 내용 요약") : mt("모집 운영 안내")}
          >
            <h3>{existing ? mt("저장할 변경 내용") : mt("모집 운영 안내")}</h3>
            <dl className="cp-review-summary">
              {reviewRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>
                    {existing && (
                      <>
                        <span className="cp-muted">
                          {mt("이전:")}
                          {row.before || mt("안내 없음")}
                        </span>
                        <br />
                      </>
                    )}
                    {existing ? mt("변경: ") : ""}
                    {row.after || mt("안내 없음")}
                  </dd>
                </div>
              ))}
            </dl>
            {existing && (
              <p className="cp-muted">
                {mt("중요 변경 공지 대상: 참석")}{" "}
                {
                  initial.registrations.filter(
                    (person) => person.status === "joined",
                  ).length
                }
                {mt("명 · 대기·자리 제안")}{" "}
                {
                  initial.registrations.filter(
                    (person) =>
                      person.status === "waiting" ||
                      person.status === "offered",
                  ).length
                }
                {mt("명. 실제 저장 시점의 최신 명단에 전달됩니다.")}
              </p>
            )}
          </section>
          {saveError && (
            <p className="cp-error" role="alert">
              {saveError}
            </p>
          )}
          <div className="cp-form-actions cp-form-actions--bottom">
            <Button disabled={saving} onClick={() => setPreview(false)}>
              {mt("더 수정하기")}
            </Button>
            <Button
              variant="primary"
              disabled={saving || (!existing && !dateConfirmed)}
              loading={saving}
              onClick={() => void submit()}
            >
              {existing ? mt("변경 내용 저장") : mt("모집 시작")}
            </Button>
          </div>
        </div>
      </section>
    );
  return (
    <section className="cp-form-panel">
      <div className="cp-section-heading">
        <div>
          <span className="cp-eyebrow">{mt("함께할 다음 라이딩")}</span>
          <h2>{mt("모임 준비하기")}</h2>
        </div>
        <Button variant="ghost" disabled={saving} onClick={onClose}>
          {mt("닫기")}
        </Button>
      </div>
      {recovery.meeting && (
        <p className="cp-feedback" role="status">
          {mt(
            "작성하던 초안을 복구했어요. 게시된 모임 내용은 아직 바뀌지 않았습니다.",
          )}{" "}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              clearDraft(scope);
              onClose();
            }}
          >
            {mt("초안 버리고 나가기")}
          </Button>
        </p>
      )}
      {saveError && (
        <div className="cp-error" role="alert">
          {saveError}
          {recovery.error && (
            <Button
              size="sm"
              onClick={() => {
                clearDraft(scope);
                onClose();
              }}
            >
              {mt("복구할 수 없는 초안 지우기")}
            </Button>
          )}
        </div>
      )}
      <form
        ref={formRef}
        className="cp-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (!reading && !saving) setPreview(true);
        }}
      >
        {actions("top")}
        <CoursePreparation
          meeting={completeDraft()}
          onChange={(next) => {
            setDraft(next);
            setStopText(next.courseStops?.join("\n") ?? "");
          }}
          onBusyChange={setReading}
        />
        <section className="cp-form-step">
        <h3>{mt("2. 모임을 알려주세요")}</h3>
        <Field label={mt("모임 이름")} htmlFor="meeting-title">
          <Input
            id="meeting-title"
            maxLength={300}
            required
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </Field>
        <div className="cp-form-grid">
          <Field label={mt("모임 종류")} htmlFor="meeting-kind">
            <Select
              id="meeting-kind"
              value={draft.kindId}
              onChange={(e) => patch({ kindId: e.target.value })}
            >
              {state.kinds
                .filter((kind) => kind.active || kind.id === draft.kindId)
                .map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {kind.name}
                    {!kind.active ? mt(" (사용 중지)") : ""}
                  </option>
                ))}
              <option value="custom">{mt("다른 종류")}</option>
            </Select>
          </Field>
          {draft.kindId === "custom" && (
            <Field label={mt("모임 종류 이름")} htmlFor="meeting-kind-name">
              <Input
                id="meeting-kind-name"
                required
                maxLength={80}
                value={draft.kindName ?? ""}
                onChange={(event) => patch({ kindName: event.target.value })}
              />
            </Field>
          )}
          <Field label={mt("정원")} htmlFor="meeting-capacity">
            <Input
              id="meeting-capacity"
              max={200}
              type="number"
              required
              min="1"
              value={draft.capacity}
              onChange={(e) => patch({ capacity: Number(e.target.value) })}
            />
          </Field>
          <Field label={mt("날짜")} htmlFor="meeting-date">
            <Input
              id="meeting-date"
              type="date"
              required
              value={draft.date}
              onChange={(e) => {
                setDateConfirmed(false);
                patch({ date: e.target.value });
              }}
            />
          </Field>
          <Field label={mt("집결 시각")} htmlFor="meeting-time">
            <Input
              id="meeting-time"
              type="time"
              required
              value={draft.time}
              onChange={(e) => {
                setDateConfirmed(false);
                patch({
                  time: e.target.value,
                  joins: draft.joins.map((join, index) =>
                    index ? join : { ...join, time: e.target.value },
                  ),
                });
              }}
            />
          </Field>
        </div>
        <Field label={mt("기본 집결 장소")} htmlFor="meeting-place">
          <Input
            id="meeting-place"
            maxLength={300}
            required
            value={draft.place}
            onChange={(e) =>
              patch({
                place: e.target.value,
                joins: draft.joins.map((join, index) =>
                  index ? join : { ...join, place: e.target.value },
                ),
              })
            }
          />
        </Field>
        <Field label={mt("모집 소개")} htmlFor="meeting-description">
          <Textarea
            id="meeting-description"
            maxLength={12000}
            rows={3}
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder={mt("어떤 풍경과 라이딩을 함께할지 소개해주세요.")}
          />
        </Field>
        </section>
        <details className="cp-divider">
          <summary>{mt("코스 소개·수동 보정")}</summary>
          <div className="cp-stack">
            <div className="cp-form-grid">
              <Field label={mt("거리 (km)")} htmlFor="meeting-distance">
                <Input
                  id="meeting-distance"
                  type="number"
                  min="0"
                  step="any"
                  value={draft.distanceKm ?? ""}
                  placeholder={mt("미정이면 비워두세요")}
                  onChange={(e) =>
                    patch({
                      distanceKm:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label={mt("획득고도 (m)")} htmlFor="meeting-elevation">
                <Input
                  id="meeting-elevation"
                  type="number"
                  min="0"
                  step="any"
                  value={draft.elevationGainM ?? ""}
                  placeholder={mt("미정이면 비워두세요")}
                  onChange={(e) =>
                    patch({
                      elevationGainM:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <Field label={mt("속도·운영 강도")} htmlFor="meeting-pace">
              <Input
                id="meeting-pace"
                maxLength={1000}
                value={draft.pace}
                onChange={(e) => patch({ pace: e.target.value })}
                placeholder={mt("예: 28–33km/h · 로테 없음")}
              />
            </Field>
            <Field
              label={mt("코스의 매력·보급·주의 구간")}
              htmlFor="meeting-highlights"
            >
              <Textarea
                id="meeting-highlights"
                maxLength={12000}
                rows={3}
                value={draft.courseHighlights ?? ""}
                onChange={(e) => patch({ courseHighlights: e.target.value })}
                placeholder={mt(
                  "풍경, 업힐, 쉬어갈 카페와 보급 계획을 알려주세요.",
                )}
              />
            </Field>
            <Field
              label={mt("주요 경유지 · 한 줄에 하나")}
              htmlFor="meeting-stops"
            >
              <Textarea
                id="meeting-stops"
                rows={4}
                value={stopText}
                onChange={(e) => setStopText(e.target.value)}
              />
            </Field>
            <Field label={mt("코스 준비")} htmlFor="meeting-course">
              <Select
                id="meeting-course"
                value={String(draft.courseReady)}
                onChange={(e) =>
                  patch({ courseReady: e.target.value === "true" })
                }
              >
                <option value="false">{mt("준비 중 · 모집 먼저 시작")}</option>
                <option value="true">{mt("코스 확정")}</option>
              </Select>
            </Field>
          </div>
        </details>
        <details className="cp-divider">
          <summary>{mt("합류·이동 안내")}</summary>
          <div className="cp-stack">
            <Field label={mt("우천 시 판단 안내")} htmlFor="meeting-weather">
              <Input
                id="meeting-weather"
                maxLength={3000}
                value={draft.weather}
                onChange={(e) => patch({ weather: e.target.value })}
                placeholder={mt("예: 토요일 18시에 진행 여부 안내")}
              />
            </Field>
            <Field label={mt("주차·현장 안내")} htmlFor="meeting-parking">
              <Textarea
                id="meeting-parking"
                maxLength={3000}
                value={draft.parking}
                onChange={(e) => patch({ parking: e.target.value })}
              />
            </Field>
            {draft.joins.slice(1).map((join) => (
              <div className="cp-form-grid" key={join.id}>
                <Field label={mt("합류 장소")} htmlFor={`place-${join.id}`}>
                  <Input
                    id={`place-${join.id}`}
                    maxLength={300}
                    required
                    value={join.place}
                    onChange={(e) =>
                      patch({
                        joins: draft.joins.map((item) =>
                          item.id === join.id
                            ? { ...item, place: e.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label={mt("합류 시각")} htmlFor={`time-${join.id}`}>
                  <Input
                    id={`time-${join.id}`}
                    required
                    type="time"
                    value={join.time}
                    onChange={(e) =>
                      patch({
                        joins: draft.joins.map((item) =>
                          item.id === join.id
                            ? { ...item, time: e.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </Field>
                <Button
                  variant="ghost"
                  onClick={() =>
                    patch({
                      joins: draft.joins.filter((item) => item.id !== join.id),
                    })
                  }
                >
                  {mt("지점 삭제")}
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() =>
                patch({
                  joins: [
                    ...draft.joins,
                    { id: `join-${Date.now()}`, place: "", time: draft.time },
                  ],
                })
              }
            >
              {mt("＋ 합류 지점 추가")}
            </Button>
          </div>
        </details>
        <details className="cp-divider">
          <summary>{mt("비용 설정 · 필요한 모임만")}</summary>
          <Field
            label={mt("예상 비용 · 없으면 0원")}
            hint={mt(
              "참고용 비용 안내입니다. 앱에서 입금·결제·환불을 처리하지 않습니다.",
            )}
            htmlFor="meeting-fee"
          >
            <Input
              id="meeting-fee"
              type="number"
              min="0"
              step="1000"
              value={draft.fee}
              onChange={(e) => patch({ fee: Number(e.target.value) })}
            />
          </Field>
        </details>
        {actions("bottom")}
      </form>
    </section>
  );
}
