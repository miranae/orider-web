import "./ActivityMemoText.css";

/** 자동 요약의 공백 정렬 표만 묶어 좁은 화면에서도 헤더와 값을 함께 스크롤한다. */
export default function ActivityMemoText({ memo, generated = false, tableFocusable = true }: { memo: string; generated?: boolean; tableFocusable?: boolean }) {
  if (!generated) return memo;
  return memo.split(/(^[ \t]+(?:Z\d+|\d+[smh])[^\n]*\n[ \t]*\d[^\n]*)/gm).map((part, index) =>
    index % 2 ? <span className="activity-memo-table" key={index} tabIndex={tableFocusable ? 0 : undefined}>{part}</span> : part);
}
