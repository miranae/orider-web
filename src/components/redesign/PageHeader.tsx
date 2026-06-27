import React from "react";
import { Text } from "../../theme/components";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}

export default function PageHeader({ eyebrow, title, subtitle, right }: PageHeaderProps) {
  return (
    <div
      className="flex items-end justify-between"
      style={{
        borderBottom: '1px solid var(--line-soft)',
        paddingBottom: 'var(--space-4)',
        marginBottom: 'var(--space-6)',
      }}
    >
      {/* 왼쪽: eyebrow + 타이틀 + 서브타이틀 */}
      <div className="flex flex-col" style={{ gap: 'var(--space-1)' }}>
        {eyebrow && <Text variant="eyebrow">{eyebrow}</Text>}
        <h1
          style={{
            margin: 0,
            fontSize: 'var(--fs-3xl)',
            fontWeight: 700,
            color: 'var(--ink-0)',
            lineHeight: 1.15,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <div style={{ fontSize: 'var(--fs-base)', color: 'var(--ink-2)' }}>{subtitle}</div>
        )}
      </div>

      {/* 오른쪽 액션 슬롯 */}
      {right && (
        <div className="flex items-center" style={{ gap: 'var(--space-2)', flexShrink: 0 }}>
          {right}
        </div>
      )}
    </div>
  );
}
