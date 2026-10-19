import type { CSSProperties, InputHTMLAttributes } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className' | 'style' | 'children' | 'aria-label' | 'color'> {
  'aria-label': string;
  /** 준비된 기록 색. 생략하면 공통 accent를 사용한다. */
  color?: string;
}

/** native 상태·키보드를 유지하고 label 안에 44px 클릭 영역을 제공한다. */
export function Checkbox({ color, ...props }: CheckboxProps) {
  return <label className="ds-control-checkbox-target"><input {...props} type="checkbox" className="ds-control-checkbox" style={color ? { '--ds-checkbox-color': color } as CSSProperties : undefined} /></label>;
}
