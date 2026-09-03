/**
 * canonical 계약 사본 드리프트 가드 (#884 — 에픽 miranae/orider-g1-app#2237).
 *
 * `shared/types/canonical.ts` 는 **사본**이다. 원본은 `orider-g1-web/shared/types/canonical.ts`.
 * 두 저장소의 `shared/` 는 게이트 없이 손 미러링되고 있어(#889) 한쪽만 고치면 조용히
 * 갈라진다.
 *
 * 저장소 경계를 넘어 원본을 읽을 수 없으므로, **계약의 wire 값과 불변식 앵커를 여기에
 * 고정**한다. 사본이 갈라지면 이 목록과 어긋나 FAIL 한다. 값을 바꾸려면 양 저장소를
 * 함께 고쳐야 하고, 그게 이 가드의 목적이다.
 *
 * app 저장소도 같은 방식을 쓴다(`scripts/check-parity-contract.py` 의
 * `check_canonical_contract_mirror`) — 세 저장소가 같은 계약을 들고 있고, 각자
 * 자기 사본을 지킨다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONTRACT = fileURLToPath(new URL('../shared/types/canonical.ts', import.meta.url));

const STATUS_WIRE = ['canonical', 'stale', 'processing', 'failed', 'unavailable'];
const PERIOD_RULE_WIRE = ['rolling', 'calendar'];
const PERIOD_UNIT_WIRE = ['day', 'week', 'month', 'year'];
const ENVELOPE_FIELDS = [
  'schemaVersion', 'algorithmVersion', 'status', 'computedAt',
  'inputRevision', 'inputDigest', 'period', 'data', 'error',
];

function main() {
  let source;
  try {
    source = readFileSync(CONTRACT, 'utf8');
  } catch {
    console.error(`canonical 계약 사본이 없다: ${CONTRACT}`);
    process.exit(1);
  }

  const errors = [];

  for (const wire of STATUS_WIRE) {
    if (!source.includes(`"${wire}"`)) errors.push(`status wire 값 "${wire}" 이 없다`);
  }
  for (const wire of [...PERIOD_RULE_WIRE, ...PERIOD_UNIT_WIRE]) {
    if (!source.includes(`"${wire}"`)) errors.push(`period wire 값 "${wire}" 이 없다`);
  }
  for (const field of ENVELOPE_FIELDS) {
    if (!new RegExp(`\\b${field}\\s*[?:]`).test(source)) {
      errors.push(`봉투 필드 "${field}" 이 없다`);
    }
  }

  // 계약의 핵심 불변식이 사본에도 있어야 한다. 없으면 사본이 서버 응답을 검증하지 못하고,
  // 계약을 어긴 응답을 그대로 그리게 된다 — 이 에픽이 고친 문제가 그대로 돌아온다.
  if (!source.includes('0 으로 대체하지 않는다')) {
    errors.push("'0 대체 금지' 불변식이 없다");
  }
  if (!source.includes('validateCanonicalEnvelope')) {
    errors.push('validateCanonicalEnvelope 가 없다');
  }
  if (!source.includes('canonicalStatusFromLegacy')) {
    errors.push('canonicalStatusFromLegacy(기존 어휘 매핑)가 없다');
  }
  // 사본임을 잊고 여기서 원본처럼 고치는 것을 막는다.
  if (!source.includes('이 파일은 사본이다')) {
    errors.push('사본 표기가 없다 — 원본이 orider-g1-web 임을 파일에 남겨야 한다');
  }

  if (errors.length > 0) {
    console.error(`canonical 계약 사본 드리프트 ${errors.length}건:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log('canonical 계약 사본: PASS');
}

main();
