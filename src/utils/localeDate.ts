/**
 * 현재 UI 언어의 BCP47 로케일 태그 — toLocale*String 인자용 (#546).
 *
 * 사용자노출 페이지가 날짜/시간을 "ko-KR" 로 하드코딩해 영어 UI 에서도 한국어 월/요일이
 * 새던 것을 ActivityPage 의 기존 패턴(i18n.language==="en"?"en-US":"ko-KR")으로 통일한다.
 * 컴포넌트는 useTranslation 으로 언어변경 시 재렌더되므로 호출 시점의 언어를 반영한다.
 */
import i18n from "../i18n";

export function localeTag(): string {
  return i18n.language?.startsWith("en") ? "en-US" : "ko-KR";
}
