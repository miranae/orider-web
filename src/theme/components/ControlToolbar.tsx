import { forwardRef, type HTMLAttributes } from 'react';
import { Button, type ButtonProps } from './Button';
import { cn } from './cn';

export type ControlToolbarProps = HTMLAttributes<HTMLDivElement> & { layout?: 'default' | 'navigation' };
export function ControlToolbar({ className, role = 'group', layout = 'default', ...props }: ControlToolbarProps) {
  return <div role={role} className={cn('ds-control-toolbar', layout === 'navigation' && 'ds-control-toolbar--navigation', className)} {...props} />;
}

export interface ToolbarGroupProps extends HTMLAttributes<HTMLDivElement> { separator?: boolean }
export function ToolbarGroup({ separator = true, className, ...props }: ToolbarGroupProps) {
  return <div className={cn('ds-toolbar-group', separator && 'ds-toolbar-group--separator', className)} {...props} />;
}

export type ToolbarButtonProps = Omit<ButtonProps, 'variant' | 'size' | 'dense' | 'className' | 'style'>;
/** 독립 44px 타깃. 페이지에서 Button 스타일을 덮어쓰지 않는다. */
export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(function ToolbarButton(props, ref) {
  return <Button ref={ref} variant="ghost" dense className="ds-toolbar-button" {...props} />;
});
