import type { DataFieldType, DataPageConfig, LayoutConfig } from "@shared/types/deviceSettings";

import { COLUMNS, MAX_PAGES, MIN_ROWS, normalize, SCHEMA_VERSION } from "./canonical";
import type { CanonicalLayout, CanonicalPage } from "./canonical";

/**
 * canonical 레코드 ↔ 편집기가 다루는 렌더 모델 (#1943 §9.1, #1950).
 *
 * 두 모델을 분리해 두는 이유는 canonical 이 **이 빌드가 모르는 것까지 보존**하기 때문이다 —
 * 상위 버전이 쓴 top-level key(`unknownKeys`)는 렌더 모델에 담기지 않는다. 그대로 다시 쓰면
 * 그 정보가 조용히 사라지므로, 저장 경로는 원본 레코드의 `unknownKeys` 를 이어 붙인다.
 */
export function toRenderable(layout: CanonicalLayout): DataPageConfig {
  return {
    pages: layout.pages.map((page) => ({
      columns: page.columns,
      rows: page.rows,
      fields: page.fields.map((f) => ({
        type: f.type as DataFieldType,
        col: f.col,
        row: f.row,
        colSpan: f.colSpan,
        rowSpan: f.rowSpan,
      })),
    })),
  };
}

/**
 * 편집 결과를 canonical 로 되돌린다.
 *
 * `base` 는 편집 대상이 된 **원본 레코드**다. 여기서 `unknownKeys` 와 sport 를 이어받는다 —
 * 새로 만들면 상위 버전 데이터를 지우고 종목까지 바꿔 쓰게 된다.
 */
export function toCanonical(pages: LayoutConfig[], base: CanonicalLayout): CanonicalLayout {
  const canonicalPages: CanonicalPage[] = pages.slice(0, MAX_PAGES).map((page) => ({
    columns: COLUMNS,
    rows: Math.max(MIN_ROWS, page.rows),
    fields: page.fields.map((f) => ({
      type: f.type,
      col: f.col,
      row: f.row,
      colSpan: f.colSpan,
      rowSpan: f.rowSpan,
    })),
  }));
  return normalize({
    schemaVersion: base.schemaVersion || SCHEMA_VERSION,
    profileId: base.profileId,
    sport: base.sport,
    pages: canonicalPages,
    unknownKeys: base.unknownKeys,
  });
}

/** 저장된 레코드가 없을 때 보여 줄 기본 구성. 저장 전까지는 **레코드가 아니다**. */
export function defaultCanonicalLayout(profileId: string, pages: LayoutConfig[]): CanonicalLayout {
  return toCanonical(pages, {
    schemaVersion: SCHEMA_VERSION,
    profileId,
    sport: "CYCLING",
    pages: [],
    unknownKeys: {},
  });
}
