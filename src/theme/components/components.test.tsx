import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert, Button, Card, Chip, Field, IconButton, Input, Progress, Stack, Stat, Switch, Text } from './index';
import { cn } from './cn';

describe('cn()', () => {
  it('falsy 무시, 객체 key 조건부 추가, 배열 평탄화', () => {
    expect(cn('a', false, null, 'b', ['c', 0, ['d']], { e: true, f: false })).toBe('a b c d e');
  });
});

describe('Button', () => {
  it('variant 와 size 가 BEM 클래스로 매핑', () => {
    render(<Button variant="primary" size="lg">시작</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/\bds-btn--primary\b/);
    expect(btn.className).toMatch(/\bds-btn--lg\b/);
  });

  it('loading 시 disabled + spinner 표시', () => {
    render(<Button loading>업로드</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.querySelector('.ds-btn__spinner')).toBeTruthy();
  });

  it('iconOnly 일 때 ds-btn--icon-only 클래스', () => {
    render(<Button iconOnly aria-label="설정"><svg /></Button>);
    expect(screen.getByRole('button').className).toMatch(/\bds-btn--icon-only\b/);
  });

  it('기본 type 은 button (form submit 방지)', () => {
    render(<Button>x</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });
});

describe('Card', () => {
  it('title/sub 헤더 렌더', () => {
    render(<Card title="요약" sub="WEEK 21">본문</Card>);
    expect(screen.getByText('요약')).toBeTruthy();
    expect(screen.getByText('WEEK 21')).toBeTruthy();
    expect(screen.getByText('본문')).toBeTruthy();
  });

  it('variant flat 적용', () => {
    const { container } = render(<Card variant="flat">x</Card>);
    expect(container.firstElementChild?.className).toMatch(/\bds-card--flat\b/);
  });
});

describe('Chip', () => {
  it('variant accent + dot 렌더', () => {
    const { container } = render(<Chip variant="accent" dot>연결됨</Chip>);
    const chip = container.firstElementChild!;
    expect(chip.className).toMatch(/\bds-chip--accent\b/);
    expect(chip.querySelector('.ds-chip__dot')).toBeTruthy();
  });
});

describe('Input + Field', () => {
  it('Field 가 label 과 input 연결', () => {
    render(
      <Field label="제목" htmlFor="t" hint="필수">
        <Input id="t" defaultValue="x" />
      </Field>,
    );
    expect(screen.getByText('제목')).toBeTruthy();
    expect(screen.getByText('필수')).toBeTruthy();
    expect((screen.getByLabelText('제목') as HTMLInputElement).value).toBe('x');
  });

  it('invalid 시 ds-input--invalid', () => {
    const { container } = render(<Input invalid />);
    expect(container.querySelector('input')?.className).toMatch(/\bds-input--invalid\b/);
  });
});

describe('Switch', () => {
  it('label prop 시 라벨 텍스트 노출', () => {
    render(<Switch label="자동 업로드" defaultChecked />);
    expect(screen.getByText('자동 업로드')).toBeTruthy();
  });
});

describe('Stack', () => {
  it('direction=row, gap, wrap 적용', () => {
    const { container } = render(
      <Stack direction="row" gap={12} wrap><span>a</span></Stack>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toMatch(/\bds-stack--row\b/);
    expect(el.className).toMatch(/\bds-stack--wrap\b/);
    expect(el.style.getPropertyValue('--ds-stack-gap')).toBe('12px');
  });
});

describe('Stat', () => {
  it('label/value/unit/delta 모두 렌더', () => {
    render(<Stat label="총 거리" value={235} unit="km" delta={{ value: '+18%', direction: 'up' }} />);
    expect(screen.getByText('총 거리')).toBeTruthy();
    expect(screen.getByText('235')).toBeTruthy();
    expect(screen.getByText('km')).toBeTruthy();
    expect(screen.getByText(/▲ \+18%/)).toBeTruthy();
  });
});

describe('Alert', () => {
  it('variant 별 클래스 + role="alert"', () => {
    const { container } = render(<Alert variant="warning" title="주의">메시지</Alert>);
    const el = container.firstElementChild!;
    expect(el.className).toMatch(/\bds-alert--warning\b/);
    expect(el.getAttribute('role')).toBe('alert');
    expect(screen.getByText('주의')).toBeTruthy();
  });
});

describe('Progress', () => {
  it('0..1 과 0..100 둘 다 받아 aria-valuenow 설정', () => {
    const { rerender, container } = render(<Progress value={0.72} />);
    expect(container.firstElementChild?.getAttribute('aria-valuenow')).toBe('72');
    rerender(<Progress value={45} />);
    expect(container.firstElementChild?.getAttribute('aria-valuenow')).toBe('45');
  });

  it('범위 밖 값은 클램프', () => {
    const { container, rerender } = render(<Progress value={-10} />);
    expect(container.firstElementChild?.getAttribute('aria-valuenow')).toBe('0');
    rerender(<Progress value={200} />);
    expect(container.firstElementChild?.getAttribute('aria-valuenow')).toBe('100');
  });
});

describe('Text', () => {
  it('variant + size + tone 클래스 매핑', () => {
    const { container } = render(<Text variant="title" size="lg" tone="accent">x</Text>);
    const el = container.firstElementChild!;
    expect(el.className).toMatch(/\bds-text--title\b/);
    expect(el.className).toMatch(/\bds-text--size-lg\b/);
    expect(el.className).toMatch(/\bds-text--tone-accent\b/);
  });

  it('as prop 으로 의미 태그 변경', () => {
    const { container } = render(<Text as="h1" variant="title">제목</Text>);
    expect(container.firstElementChild?.tagName).toBe('H1');
  });

  it('truncate 클래스 적용', () => {
    const { container } = render(<Text truncate>긴 텍스트입니다</Text>);
    expect(container.firstElementChild?.className).toMatch(/\bds-text--truncate\b/);
  });
});

describe('IconButton', () => {
  it('aria-label 적용 + icon-only 클래스', () => {
    render(<IconButton aria-label="설정" icon={<svg />} />);
    const btn = screen.getByRole('button', { name: '설정' });
    expect(btn.className).toMatch(/\bds-btn--icon-only\b/);
  });

  it('variant 기본값 ghost', () => {
    const { container } = render(<IconButton aria-label="x" icon={<svg />} />);
    expect(container.firstElementChild?.className).toMatch(/\bds-btn--ghost\b/);
  });
});

describe('Card padding prop', () => {
  it('padding="none" 시 inline padding:0', () => {
    const { container } = render(<Card padding="none">x</Card>);
    expect((container.firstElementChild as HTMLElement).style.padding).toBe('0px');
  });

  it('padding="card"(기본) 시 inline padding 미설정 → CSS 기본 16px 사용', () => {
    const { container } = render(<Card>x</Card>);
    expect((container.firstElementChild as HTMLElement).style.padding).toBe('');
  });

  it('padding 숫자 전달 시 그대로 적용', () => {
    const { container } = render(<Card padding={24}>x</Card>);
    expect((container.firstElementChild as HTMLElement).style.padding).toBe('24px');
  });
});
