/** 오라이더 원본 도안. 왼쪽 아래에서 오른쪽 위로 나아가는 뒤쪽 사선 시점. */
export interface SportIconShape {
  tag: 'path' | 'ellipse' | 'circle';
  attributes: Record<string, string | number>;
}

export const REAR_SPORT_VIEWBOX = '0 0 24 24';
export const REAR_SPORT_STROKE_WIDTH = 1.7;

function insetArtwork(shapes: readonly SportIconShape[], scale: number): readonly SportIconShape[] {
  const offset = 12 * (1 - scale);
  return shapes.map(shape => ({
    ...shape,
    attributes: { ...shape.attributes, transform: `translate(${offset} ${offset}) scale(${scale}) ${shape.attributes.transform ?? ''}` },
  }));
}

export const REAR_SPORT_ARTWORK: Record<'bike' | 'run' | 'swim', readonly SportIconShape[]> = {
  bike: insetArtwork([
    { tag: 'ellipse', attributes: { cx: 17.1, cy: 17, rx: 2.65, ry: 4.25, transform: 'rotate(8 17.1 17)', opacity: .7, strokeWidth: 1.45 } },
    { tag: 'ellipse', attributes: { cx: 6.6, cy: 18.1, rx: 3.2, ry: 4.8, transform: 'rotate(8 6.6 18.1)', strokeWidth: 1.5 } },
    { tag: 'path', attributes: { d: 'M6.6 18.1 9.7 13.6 11.2 19.2 6.6 18.1M9.7 13.6 17.7 12.1 11.2 19.2M17.7 12.1 17.1 17', strokeWidth: 1.25, opacity: .8 } },
    { tag: 'path', attributes: { d: 'M8.1 11.4 8.4 14.4l.9 1.5', strokeWidth: 1.5, opacity: .7 } },
    { tag: 'path', attributes: { d: 'M7 9.9c.1-1.5 1.5-2.3 2.1-3.5 1.1-2 3.2-2.2 5.1-1.4 1.2.5 1.1 1.6 1.1 2.5L12 10.8c-1.9.1-3.6-.3-5-.9Z', strokeWidth: 1.3 } },
    { tag: 'path', attributes: { d: 'M6.7 9.8c1.8-.4 3.8.1 5.8 1.4l.8.8c.8 1.1.1 1.7-.9 1.5l-1.6-.3L9 12.4l-2-.4c-1.2-.5-1-1.4-.3-2.2Z', fill: 'currentColor', stroke: 'none' } },
    { tag: 'path', attributes: { d: 'M15.3 7.5 17.6 11.8M12.2 9.4 16 12l1.6-.2M12.3 13.1 10.9 16.2l1.5 1.4M17.6 11.8l1 .4-.4.9', strokeWidth: 1.5 } },
    { tag: 'path', attributes: { d: 'M10.7 16.1 12.6 17.4l-.5.8-2.1-1.1Z', fill: 'currentColor', stroke: 'none' } },
    { tag: 'path', attributes: { d: 'M12.6 3.5c-.7-1.5.5-2.6 2-2.3 1.2.2 2.1 1.4 1.6 2.6l-3.6-.3ZM13 2.1l3.3 1', strokeWidth: 1.1 } },
  ], .9),
  run: [
    { tag: 'path', attributes: { d: 'M9.7 7.4 7.9 9l.7 1.4M8 11.7 6.3 14.2l.8 1.9', opacity: .7, strokeWidth: 1.25 } },
    { tag: 'path', attributes: { d: 'M9.3 6.8c1.9-.2 3.8.7 5.4 2.2l-2.9 4.2q-.4.6-1 .3l-2.9-1.7q-.5-.3-.2-.9Z', strokeWidth: 1.3 } },
    { tag: 'path', attributes: { d: 'M8.1 10.8c1.7.4 3.1 1 4 1.7l-.7 1.3q-.2.3-.8-.2l-2.7-1.7Z', fill: 'currentColor', stroke: 'none' } },
    { tag: 'path', attributes: { d: 'M14.3 9.4 15.3 12.2l2.7-1.1M10.8 13.4 9.4 17.2 5 19.5' } },
    { tag: 'path', attributes: { d: 'M5 19.5 3.9 20', strokeWidth: 2.1 } },
    { tag: 'circle', attributes: { cx: 13.6, cy: 3.9, r: 1.9, fill: 'currentColor', stroke: 'none' } },
  ],
  swim: [
    { tag: 'path', attributes: { d: 'M10.3 10.1 8.2 7.1l3-2.3', opacity: .7, strokeWidth: 1.25 } },
    { tag: 'path', attributes: { d: 'M10.3 10.1c2.1.5 3.2 1.6 3.2 2.7L9 16c-1.6 0-2.1-.6-2.4-1.4Z', strokeWidth: 1.3 } },
    { tag: 'path', attributes: { d: 'M7.2 13.8 10.4 14.6 9 16c-1.6 0-2.1-.6-2.4-1.4Z', fill: 'currentColor', stroke: 'none' } },
    { tag: 'path', attributes: { d: 'M13.1 12.3 16.5 11.4 20.2 9.1' } },
    { tag: 'circle', attributes: { cx: 14.7, cy: 8.3, r: 1.65, fill: 'currentColor', stroke: 'none' } },
    { tag: 'path', attributes: { d: 'M2.5 17c1.1.9 2.2.9 3.3 0s2.2-.9 3.3 0 2.2.9 3.3 0 2.2-.9 3.3 0 2.2.9 3.3 0' } },
    { tag: 'path', attributes: { d: 'M5 20.5c1.1-.9 2.2-.9 3.3 0s2.2.9 3.3 0 2.2-.9 3.3 0' } },
  ],
};

/** 작은 사이즈는 자세를 유지하며 겹치는 프레임·헬멧 선만 줄인다. */
const COMPACT_BIKE_PATHS: Partial<Record<number, string>> = {
    2: 'M6.6 18.1 9.7 13.6 11.2 19.2 6.6 18.1M11.2 19.2 17.1 17M17.7 12.1 17.1 17',
    5: 'M6.7 9.8c1.8-.4 3.8.1 5.8 1.4l.8.8c.8 1.1.1 1.7-.9 1.5l-1 2.5 1.4 1.4-.6.7-1.9-1.3q-.5-.4-.2-1.1l.9-2.3-2-.9-2-.5c-1.2-.5-1-1.4-.3-2.2Z',
    6: 'M15.3 7.5 17.6 11.8M12.2 9.4 16 12l1.6-.2M17.6 11.8l1 .4-.4.9',
    8: 'M12.6 3.5c-.7-1.5.5-2.6 2-2.3 1.2.2 2.1 1.4 1.6 2.6l-3.6-.3Z',
};
const COMPACT_BIKE_ARTWORK = REAR_SPORT_ARTWORK.bike.flatMap((shape, index): SportIconShape[] => {
  if (index === 7) return [];
  return [{ ...shape, attributes: { ...shape.attributes, ...(COMPACT_BIKE_PATHS[index] ? { d: COMPACT_BIKE_PATHS[index] } : {}) } }];
});

export function getRearSportArtwork(sport: 'bike' | 'run' | 'swim', size: number): readonly SportIconShape[] {
  return sport === 'bike' && size <= 24 ? COMPACT_BIKE_ARTWORK : REAR_SPORT_ARTWORK[sport];
}
