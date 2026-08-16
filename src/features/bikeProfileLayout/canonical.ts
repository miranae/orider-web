/**
 * 데이터 페이지 canonical schema v1 — 웹 구현 (#1943 §8.2).
 *
 * Shared(Kotlin) `BikeDataPageLayoutCodec` · Functions `bike-profile-layout/canonical.ts` 와
 * **문자열 단위로 같은 결과**를 내야 한다. 셋 중 하나만 달라지면 서버가 payloadHash 불일치로
 * 정상 저장을 거부한다. 규칙을 바꿀 땐 세 구현을 함께 고치고 GOLDEN 상수를 다시 맞춘다.
 */

export const SCHEMA_VERSION = 1;
export const COLUMNS = 4;
export const MIN_ROWS = 1;
export const MAX_ROWS = 12;
export const MIN_PAGES = 1;
export const MAX_PAGES = 5;

const KNOWN_TOP_LEVEL_KEYS = new Set(["schemaVersion", "profileId", "sport", "pages"]);
const KNOWN_SPORTS = new Set(["CYCLING", "RUNNING", "TREKKING"]);

/** 1MB 문서 한도와 noise 방어. 5페이지 × 48칸이면 여유 있게 들어간다. */
const MAX_PAYLOAD_BYTES = 64 * 1024;

export type CanonicalPlacement = {
  type: string;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
};

export type CanonicalPage = {
  columns: number;
  rows: number;
  fields: CanonicalPlacement[];
};

export type CanonicalLayout = {
  schemaVersion: number;
  profileId: string;
  sport: string;
  pages: CanonicalPage[];
  /** v1 이 모르는 top-level key. 원문 보존하며 해시 범위에 포함된다. */
  unknownKeys: Record<string, unknown>;
};

export type LayoutValidationError =
  | "MALFORMED_JSON"
  | "NOT_AN_OBJECT"
  | "MISSING_REQUIRED_KEY"
  | "WRONG_VALUE_TYPE"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "BLANK_PROFILE_ID"
  | "UNKNOWN_SPORT"
  | "PAGE_COUNT_OUT_OF_RANGE"
  | "INVALID_COLUMNS"
  | "INVALID_ROWS"
  | "NEGATIVE_POSITION"
  | "NON_POSITIVE_SPAN"
  | "PLACEMENT_OUT_OF_BOUNDS"
  | "PLACEMENT_OVERLAP"
  | "PAYLOAD_TOO_LARGE"
  /** JS number 로 왕복할 수 없는 정수 리터럴. 조용히 뭉개는 대신 거절한다. */
  | "UNSAFE_NUMBER_LITERAL";

export type LayoutValidationIssue = { error: LayoutValidationError; path: string };

export type ParseResult =
  | { ok: true; layout: CanonicalLayout }
  | { ok: false; issues: LayoutValidationIssue[] };

/** 문자열 리터럴 밖의 정수 토큰 중 안전 범위를 넘는 게 있는지. */
function hasUnsafeIntegerLiteral(raw: string): boolean {
  // 문자열 리터럴을 먼저 지워 본문 속 숫자를 오탐하지 않는다.
  const withoutStrings = raw.replace(/"(?:[^"\\]|\\.)*"/gu, '""');
  for (const match of withoutStrings.matchAll(/-?\d+/gu)) {
    const literal = match[0];
    // 지수·소수는 애초에 정밀도 계약 대상이 아니다. 정수 토큰만 본다.
    if (literal.replace("-", "").length < 16) continue;
    if (!Number.isSafeInteger(Number(literal))) return true;
  }
  return false;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * 검증하며 파싱한다. 실패는 예외가 아니라 issue 목록 — 깨진 payload 를 자동으로 덮어쓰면
 * 사용자 구성이 소리 없이 사라지므로 호출부가 읽기 전용 preview 로 내려간다.
 */
export function parseCanonicalLayout(raw: string, expectedSport?: string): ParseResult {
  if (utf8ByteLength(raw) > MAX_PAYLOAD_BYTES) {
    return { ok: false, issues: [{ error: "PAYLOAD_TOO_LARGE", path: "$" }] };
  }

  // `JSON.parse` 는 2^53 을 넘는 정수를 가장 가까운 double 로 뭉갠다(`9007199254740993` →
  // `...992`). 그대로 재직렬화하면 opaque 데이터가 손상되고 payloadHash 계약이 깨지므로,
  // 왕복할 수 없는 리터럴은 **받지 않는다**. 조용한 손상보다 명시적 거절이 안전하다.
  if (hasUnsafeIntegerLiteral(raw)) {
    return { ok: false, issues: [{ error: "UNSAFE_NUMBER_LITERAL", path: "$" }] };
  }

  let root: unknown;
  try {
    root = JSON.parse(raw);
  } catch {
    return { ok: false, issues: [{ error: "MALFORMED_JSON", path: "$" }] };
  }
  if (typeof root !== "object" || root === null || Array.isArray(root)) {
    return { ok: false, issues: [{ error: "NOT_AN_OBJECT", path: "$" }] };
  }

  const obj = root as Record<string, unknown>;
  const issues: LayoutValidationIssue[] = [];

  const schemaVersion = obj.schemaVersion;
  if (!isInteger(schemaVersion)) issues.push({ error: "MISSING_REQUIRED_KEY", path: "$.schemaVersion" });
  else if (schemaVersion !== SCHEMA_VERSION) {
    issues.push({ error: "UNSUPPORTED_SCHEMA_VERSION", path: "$.schemaVersion" });
  }

  const profileId = obj.profileId;
  if (typeof profileId !== "string" || profileId.trim() === "") {
    issues.push({ error: "BLANK_PROFILE_ID", path: "$.profileId" });
  }

  const sport = obj.sport;
  if (typeof sport !== "string" || !KNOWN_SPORTS.has(sport)) issues.push({ error: "UNKNOWN_SPORT", path: "$.sport" });
  else if (expectedSport !== undefined && sport !== expectedSport) {
    issues.push({ error: "UNKNOWN_SPORT", path: "$.sport" });
  }

  const rawPages = obj.pages;
  const pages: CanonicalPage[] = [];
  if (!Array.isArray(rawPages)) {
    issues.push({ error: rawPages === undefined ? "MISSING_REQUIRED_KEY" : "WRONG_VALUE_TYPE", path: "$.pages" });
  } else {
    if (rawPages.length < MIN_PAGES || rawPages.length > MAX_PAGES) {
      issues.push({ error: "PAGE_COUNT_OUT_OF_RANGE", path: "$.pages" });
    }
    rawPages.forEach((pageValue, index) => {
      const page = parsePage(pageValue, `$.pages[${index}]`, issues);
      if (page) pages.push(page);
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  // `Object.create(null)` 로 만든다 — 일반 객체에 대입하면 JSON 의 유효한 `__proto__` 키가
  // own property 가 아니라 prototype setter 로 먹혀 인코딩에서 사라지고, 원문 보존과
  // payloadHash 계약이 함께 깨진다.
  const unknownKeys: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) unknownKeys[key] = value;
  }

  return {
    ok: true,
    layout: normalize({
      schemaVersion: schemaVersion as number,
      profileId: profileId as string,
      sport: sport as string,
      pages,
      unknownKeys,
    }),
  };
}

function parsePage(value: unknown, path: string, issues: LayoutValidationIssue[]): CanonicalPage | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.push({ error: "WRONG_VALUE_TYPE", path });
    return null;
  }
  const page = value as Record<string, unknown>;

  const columns = page.columns;
  if (columns !== COLUMNS) issues.push({ error: "INVALID_COLUMNS", path: `${path}.columns` });

  const rows = page.rows;
  if (!isInteger(rows) || rows < MIN_ROWS || rows > MAX_ROWS) {
    issues.push({ error: "INVALID_ROWS", path: `${path}.rows` });
  }

  const rawFields = page.fields;
  const fields: CanonicalPlacement[] = [];
  if (!Array.isArray(rawFields)) {
    issues.push({
      error: rawFields === undefined ? "MISSING_REQUIRED_KEY" : "WRONG_VALUE_TYPE",
      path: `${path}.fields`,
    });
  } else {
    const effectiveRows = isInteger(rows) ? rows : MAX_ROWS;
    rawFields.forEach((fieldValue, index) => {
      const placement = parsePlacement(fieldValue, `${path}.fields[${index}]`, effectiveRows, issues);
      if (placement) fields.push(placement);
    });
    fields.forEach((a, i) => {
      for (let j = i + 1; j < fields.length; j += 1) {
        const b = fields[j];
        if (b && overlaps(a, b)) issues.push({ error: "PLACEMENT_OVERLAP", path: `${path}.fields[${j}]` });
      }
    });
  }

  if (columns !== COLUMNS || !isInteger(rows)) return null;
  return { columns, rows, fields };
}

function parsePlacement(
  value: unknown,
  path: string,
  rows: number,
  issues: LayoutValidationIssue[],
): CanonicalPlacement | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.push({ error: "WRONG_VALUE_TYPE", path });
    return null;
  }
  const field = value as Record<string, unknown>;

  const type = field.type;
  if (typeof type !== "string" || type.trim() === "") {
    issues.push({ error: "MISSING_REQUIRED_KEY", path: `${path}.type` });
    return null;
  }
  const { col, row } = field;
  if (!isInteger(col) || !isInteger(row)) {
    issues.push({ error: "MISSING_REQUIRED_KEY", path: `${path}.col|row` });
    return null;
  }
  // v1 에서 span 은 **생략만** 허용하며 기본 1. 키가 있는데 정수가 아니면 손상이라 격리한다 —
  // 1로 정상화하면 깨진 payload 가 조용히 "유효한 1칸" 으로 바뀌어 구성이 사라진다.
  const colSpan = field.colSpan === undefined ? 1 : field.colSpan;
  const rowSpan = field.rowSpan === undefined ? 1 : field.rowSpan;
  if (!isInteger(colSpan) || !isInteger(rowSpan)) {
    issues.push({ error: "WRONG_VALUE_TYPE", path: `${path}.colSpan|rowSpan` });
    return null;
  }

  if (col < 0 || row < 0) issues.push({ error: "NEGATIVE_POSITION", path });
  if (colSpan < 1 || rowSpan < 1) issues.push({ error: "NON_POSITIVE_SPAN", path });
  if (col >= 0 && row >= 0 && colSpan >= 1 && rowSpan >= 1 && (col + colSpan > COLUMNS || row + rowSpan > rows)) {
    issues.push({ error: "PLACEMENT_OUT_OF_BOUNDS", path });
  }

  return { type, col, row, colSpan, rowSpan };
}

function overlaps(a: CanonicalPlacement, b: CanonicalPlacement): boolean {
  return (
    a.col < b.col + b.colSpan &&
    b.col < a.col + a.colSpan &&
    a.row < b.row + b.rowSpan &&
    b.row < a.row + a.rowSpan
  );
}

/**
 * 의미를 바꾸지 않는 표현 차이를 제거한다.
 * 페이지 **순서는 유지**(사용자 의도), 페이지 안의 배치만 정렬(겹침 금지라 순서에 의미 없음).
 */
export function normalize(layout: CanonicalLayout): CanonicalLayout {
  return {
    ...layout,
    pages: layout.pages.map((page) => ({
      ...page,
      fields: [...page.fields].sort(
        (a, b) =>
          a.row - b.row ||
          a.col - b.col ||
          a.colSpan - b.colSpan ||
          a.rowSpan - b.rowSpan ||
          (a.type < b.type ? -1 : a.type > b.type ? 1 : 0),
      ),
    })),
  };
}

/** Kotlin `BikeDataPageLayoutCodec.encode` 와 같은 문자열. 키 순서 고정, 공백 없음. */
export function encodeCanonicalLayout(layout: CanonicalLayout): string {
  const normalized = normalize(layout);
  const parts: string[] = [
    `"schemaVersion":${normalized.schemaVersion}`,
    `"profileId":${JSON.stringify(normalized.profileId)}`,
    `"sport":${JSON.stringify(normalized.sport)}`,
    `"pages":[${normalized.pages.map(encodePage).join(",")}]`,
  ];
  for (const key of Object.keys(normalized.unknownKeys).sort()) {
    parts.push(`${JSON.stringify(key)}:${encodeUnknown(normalized.unknownKeys[key])}`);
  }
  return `{${parts.join(",")}}`;
}

function encodePage(page: CanonicalPage): string {
  const fields = page.fields
    .map(
      (f) =>
        `{"type":${JSON.stringify(f.type)},"col":${f.col},"row":${f.row},` +
        `"colSpan":${f.colSpan},"rowSpan":${f.rowSpan}}`,
    )
    .join(",");
  return `{"columns":${page.columns},"rows":${page.rows},"fields":[${fields}]}`;
}

/** 모르는 값도 결정적으로 재직렬화 — object 는 키 정렬, array 는 순서 유지. */
function encodeUnknown(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(encodeUnknown).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${encodeUnknown(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * payload object 전체에 대한 SHA-256(소문자 hex). 문서 metadata 는 해시 범위 밖이다.
 *
 * Web Crypto 는 비동기라 저장 경로에서만 부른다. 브라우저·Node 테스트 모두 `globalThis.crypto`
 * 를 쓰므로 별도 폴리필이 필요 없다.
 */
export async function payloadHash(canonicalJson: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
