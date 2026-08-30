import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  profileGradeBand,
  profileAnnotationPlacement,
  selectProminentProfilePeaks,
  type CourseProfileLandmark,
  type CourseProfilePoint,
} from "./profileLandmarks";

interface CourseStageProfileProps {
  data: readonly CourseProfilePoint[];
  onHoverIndex?: (index: number | null) => void;
}

interface RenderPoint extends CourseProfilePoint {
  index: number;
  x: number;
  y: number;
}

type ProfilePositionStyle = CSSProperties & {
  "--profile-x": string;
  "--profile-y"?: string;
  "--profile-row"?: string;
};

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 300;
const BASELINE_Y = 268;
const PROFILE_TOP = 20;

function formatDistance(distanceMeters: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(distanceMeters / 1000);
}

function formatElevation(elevationMeters: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(elevationMeters);
}

function pointAriaLabel(
  landmark: CourseProfileLandmark,
  number: number,
  locale: string,
  translate: (key: string, options?: Record<string, unknown>) => string,
): string {
  return translate("stageProfile.pointLabel", {
    number,
    distance: formatDistance(landmark.distance, locale),
    elevation: formatElevation(landmark.elevation, locale),
  });
}

export function CourseStageProfile({ data, onHoverIndex }: CourseStageProfileProps) {
  const { t, i18n } = useTranslation("course");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const points = useMemo(() => data
    .map((point, index) => ({ ...point, index }))
    .filter((point) => Number.isFinite(point.distance) && Number.isFinite(point.elevation))
    .filter((point, index, finite) => index === 0 || point.distance > finite[index - 1]!.distance), [data]);
  const landmarks = useMemo(() => selectProminentProfilePeaks(data), [data]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hoveredPoint, setHoveredPoint] = useState<RenderPoint | null>(null);

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(0, landmarks.length - 1)));
  }, [landmarks.length]);

  const renderModel = useMemo(() => {
    if (points.length < 2) return null;
    const firstDistance = points[0]!.distance;
    const lastDistance = points[points.length - 1]!.distance;
    const distanceRange = lastDistance - firstDistance;
    const minimumElevation = Math.min(...points.map((point) => point.elevation));
    const maximumElevation = Math.max(...points.map((point) => point.elevation));
    const elevationPadding = Math.max(20, (maximumElevation - minimumElevation) * 0.08);
    const chartMinimum = Math.max(0, minimumElevation - elevationPadding);
    const chartMaximum = maximumElevation + elevationPadding;
    const elevationRange = Math.max(1, chartMaximum - chartMinimum);

    const rendered: RenderPoint[] = points.map((point) => ({
      ...point,
      x: ((point.distance - firstDistance) / distanceRange) * VIEWBOX_WIDTH,
      y: BASELINE_Y - ((point.elevation - chartMinimum) / elevationRange) * (BASELINE_Y - PROFILE_TOP),
    }));
    return { firstDistance, lastDistance, chartMinimum, chartMaximum, rendered };
  }, [points]);

  if (!renderModel) return null;

  const { firstDistance, lastDistance, chartMinimum, chartMaximum, rendered } = renderModel;
  const distanceRange = lastDistance - firstDistance;
  const ridgePath = rendered.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const landmarkPositions = landmarks.map((landmark) => {
    const sourcePoint = rendered.find((point) => point.index === landmark.index)!;
    return {
      ...landmark,
      xPercent: ((landmark.distance - firstDistance) / distanceRange) * 100,
      yPercent: (sourcePoint.y / VIEWBOX_HEIGHT) * 100,
      sourcePoint,
    };
  }).map((landmark, index) => ({
    ...landmark,
    placement: profileAnnotationPlacement(index, landmark.xPercent / 100),
  }));
  const selected = landmarkPositions[selectedIndex] ?? null;
  const nextSelectedIndex = selected ? (selectedIndex + 1) % landmarkPositions.length : 0;
  const nextSelected = landmarkPositions[nextSelectedIndex] ?? null;

  const setActiveLandmark = (index: number) => {
    setSelectedIndex(index);
    const landmark = landmarkPositions[index];
    if (landmark) onHoverIndex?.(landmark.index);
  };

  const handlePointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!(rect.width > 0)) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const targetDistance = firstDistance + ratio * distanceRange;
    let closest = rendered[0]!;
    for (const point of rendered) {
      if (Math.abs(point.distance - targetDistance) < Math.abs(closest.distance - targetDistance)) closest = point;
    }
    setHoveredPoint(closest);
    onHoverIndex?.(closest.index);
  };

  const activePoint = hoveredPoint ?? selected?.sourcePoint ?? null;
  const activeStyle = activePoint ? {
    "--profile-x": `${(activePoint.x / VIEWBOX_WIDTH) * 100}%`,
    "--profile-y": `${(activePoint.y / VIEWBOX_HEIGHT) * 100}%`,
  } as ProfilePositionStyle : undefined;

  return (
    <section className="course-stage-profile" aria-labelledby="course-stage-profile-heading">
      <div className="course-stage-profile__heading-row">
        <div>
          <p className="course-stage-profile__eyebrow">{t("stageProfile.eyebrow")}</p>
          <h2 id="course-stage-profile-heading" className="course-stage-profile__heading">
            {t("stageProfile.title")}
          </h2>
        </div>
        <ul className="course-stage-profile__legend" aria-label={t("stageProfile.gradeLegend") }>
          {(["flat", "rolling", "steep"] as const).map((band) => (
            <li key={band} data-band={band}><i aria-hidden="true" />{t(`grade.${band}`)}</li>
          ))}
        </ul>
      </div>

      {landmarkPositions.length > 0 && (
        <div className="course-stage-profile__annotation-rail" data-testid="stage-profile-annotation-rail">
          {landmarkPositions.map((landmark, index) => (
            <div
              key={landmark.index}
              className="course-stage-profile__annotation-slot"
              data-edge={landmark.placement.edge}
              style={{
                "--profile-x": `${landmark.xPercent}%`,
                "--profile-row": `${landmark.placement.row}`,
              } as ProfilePositionStyle}
            >
              <button
                type="button"
                className="course-stage-profile__annotation-card"
                aria-pressed={selectedIndex === index}
                onClick={() => setActiveLandmark(index)}
                onFocus={() => setActiveLandmark(index)}
                onMouseEnter={() => onHoverIndex?.(landmark.index)}
                onMouseLeave={() => onHoverIndex?.(null)}
                onBlur={() => onHoverIndex?.(null)}
              >
                <span className="course-stage-profile__number">{index + 1}</span>
                <span className="course-stage-profile__point-name">{t("stageProfile.highPointNumber", { number: index + 1 })}</span>
                <span className="course-stage-profile__point-meta">
                  {t("stageProfile.distanceElevation", {
                    distance: formatDistance(landmark.distance, locale),
                    elevation: formatElevation(landmark.elevation, locale),
                  })}
                </span>
              </button>
              <svg
                className="course-stage-profile__connector"
                viewBox="0 0 128 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d={landmark.placement.connectorPath} />
              </svg>
            </div>
          ))}
        </div>
      )}

      {selected && nextSelected && (
        <button
          type="button"
          className="course-stage-profile__mobile-detail"
          onClick={() => setActiveLandmark((selectedIndex + 1) % landmarkPositions.length)}
          aria-label={t("stageProfile.nextPointLabel", {
            number: nextSelectedIndex + 1,
            distance: formatDistance(nextSelected.distance, locale),
            elevation: formatElevation(nextSelected.elevation, locale),
          })}
        >
          <span className="course-stage-profile__number">{selectedIndex + 1}</span>
          <span>{t("stageProfile.highPointNumber", { number: selectedIndex + 1 })}</span>
          <strong>
            {t("stageProfile.distanceElevation", {
              distance: formatDistance(selected.distance, locale),
              elevation: formatElevation(selected.elevation, locale),
            })}
          </strong>
          <span className="course-stage-profile__mobile-next" aria-hidden="true">{t("stageProfile.next")}</span>
        </button>
      )}

      <div
        className="course-stage-profile__chart"
        aria-label={t("stageProfile.chartLabel")}
        onPointerDown={handlePointer}
        onPointerMove={handlePointer}
        onPointerLeave={() => {
          setHoveredPoint(null);
          onHoverIndex?.(null);
        }}
      >
        <svg
          className="course-stage-profile__svg"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-hidden="true"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = PROFILE_TOP + ratio * (BASELINE_Y - PROFILE_TOP);
            return <line key={ratio} className="course-stage-profile__gridline" x1="0" x2={VIEWBOX_WIDTH} y1={y} y2={y} />;
          })}
          {rendered.slice(0, -1).map((point, index) => {
            const next = rendered[index + 1]!;
            return (
              <path
                key={`${point.index}-${next.index}`}
                className="course-stage-profile__area-segment"
                data-band={profileGradeBand(point, next)}
                d={`M${point.x},${BASELINE_Y} L${point.x},${point.y} L${next.x},${next.y} L${next.x},${BASELINE_Y} Z`}
              />
            );
          })}
          <path className="course-stage-profile__ridge" d={ridgePath} />
          <line className="course-stage-profile__baseline" x1="0" x2={VIEWBOX_WIDTH} y1={BASELINE_Y} y2={BASELINE_Y} />
          {landmarkPositions.map((landmark, index) => (
            <g key={landmark.index}>
              <line
                className="course-stage-profile__ridge-connector"
                data-selected={selectedIndex === index ? "1" : undefined}
                x1={landmark.sourcePoint.x}
                x2={landmark.sourcePoint.x}
                y1="0"
                y2={landmark.sourcePoint.y}
              />
              <circle
                className="course-stage-profile__ridge-dot"
                data-selected={selectedIndex === index ? "1" : undefined}
                cx={landmark.sourcePoint.x}
                cy={landmark.sourcePoint.y}
                r="7"
              />
              <text
                className="course-stage-profile__ridge-number"
                x={landmark.sourcePoint.x}
                y={landmark.sourcePoint.y + 3}
                textAnchor="middle"
              >{index + 1}</text>
            </g>
          ))}
        </svg>

        {landmarkPositions.map((landmark, index) => (
          <button
            key={landmark.index}
            type="button"
            className="course-stage-profile__ridge-hit"
            data-number={index + 1}
            style={{
              "--profile-x": `${landmark.xPercent}%`,
              "--profile-y": `${landmark.yPercent}%`,
            } as ProfilePositionStyle}
            aria-label={pointAriaLabel(landmark, index + 1, locale, t)}
            aria-pressed={selectedIndex === index}
            onClick={(event) => {
              event.stopPropagation();
              setActiveLandmark(index);
            }}
            onFocus={() => setActiveLandmark(index)}
            onBlur={() => onHoverIndex?.(null)}
          />
        ))}

        <span className="course-stage-profile__endpoint course-stage-profile__endpoint--start" aria-hidden="true">S</span>
        <span className="course-stage-profile__endpoint course-stage-profile__endpoint--finish" aria-hidden="true">F</span>

        {activePoint && (
          <output
            className="course-stage-profile__tooltip"
            data-edge={activePoint.x / VIEWBOX_WIDTH < 0.2 ? "left" : activePoint.x / VIEWBOX_WIDTH > 0.8 ? "right" : "center"}
            data-low={activePoint.y / VIEWBOX_HEIGHT > 0.72 ? "1" : undefined}
            style={activeStyle}
            aria-live="polite"
          >
            <strong>{formatDistance(activePoint.distance, locale)} km</strong>
            <span>{formatElevation(activePoint.elevation, locale)} m</span>
          </output>
        )}

        <div className="course-stage-profile__y-axis" aria-hidden="true">
          <span>{formatElevation(chartMaximum, locale)} m</span>
          <span>{formatElevation((chartMaximum + chartMinimum) / 2, locale)} m</span>
          <span>{formatElevation(chartMinimum, locale)} m</span>
        </div>
        <div className="course-stage-profile__x-axis" aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <span key={ratio}>{formatDistance(firstDistance + distanceRange * ratio, locale)}</span>
          ))}
        </div>
      </div>
      <p className="course-stage-profile__note">{t("stageProfile.note")}</p>
    </section>
  );
}
