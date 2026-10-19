import i18n from "../../i18n";
import ko from "../../i18n/resources/ko/clubMeeting.json";
import en from "../../i18n/resources/en/clubMeeting.json";
// 승인된 모임 작성 화면에서 쓰는 문구만 해당 기능 청크와 함께 불러온다.
i18n.addResourceBundle("ko", "clubMeeting", ko, true, true);
i18n.addResourceBundle("en", "clubMeeting", en, true, true);
export function mt(key: string): string {
  return i18n.t(key, {
    ns: "clubMeeting",
    keySeparator: false,
    nsSeparator: false,
    defaultValue: key,
  });
}
