import SportIcon, { type SportIconProps } from "./SportIcon";

/** 기존 러닝 전용 호출부도 공통 종목 아이콘을 사용한다. */
export default function RunIcon(props: Omit<SportIconProps, "sport">) {
  return <SportIcon sport="run" {...props} />;
}
