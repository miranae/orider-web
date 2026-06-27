import React from "react";

interface SectionHeaderProps {
  title: string;
  sub?: string;
  right?: React.ReactNode;
}

export default function SectionHeader({ title, sub, right }: SectionHeaderProps) {
  return (
    <div
      className="flex items-end justify-between"
      style={{
        borderBottom: '1px solid var(--line-soft)',
        marginBottom: 'var(--space-3)',
        paddingBottom: 'var(--space-3)',
      }}
    >
      {/* 왼쪽: 타이틀 + 서브 */}
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: 'var(--fs-lg)',
            fontWeight: 600,
            color: 'var(--ink-0)',
          }}
        >
          {title}
        </h3>
        {sub && (
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-3)' }}>{sub}</span>
        )}
      </div>

      {/* 오른쪽 슬롯 */}
      {right && <div>{right}</div>}
    </div>
  );
}
