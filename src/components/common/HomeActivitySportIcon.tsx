import { useId, type SVGProps } from 'react';
import pixelReference from '../../assets/sport-pixel-reference.png';
import indoorBikeReference from '../../assets/sport-indoor-bike-reference.png';
import type { HomeActivitySport } from '../../utils/homeActivitySport';
import SportIcon from './SportIcon';
import './HomeActivitySportIcon.css';

type HomeActivitySportIconProps = SVGProps<SVGSVGElement> & {
  sport: HomeActivitySport;
  size?: number;
};

const CELL_X: Record<Exclude<HomeActivitySport, 'swim'>, number> = {
  bike: 12,
  mtb: 147,
  'indoor-bike': 283,
  run: 420,
  trekking: 557,
};

/** 사용자가 제공한 픽셀 원본에서 테두리·설명을 제외한 종목 셀만 표시한다. */
export default function HomeActivitySportIcon({ sport, size = 32, className, ...props }: HomeActivitySportIconProps) {
  const filterId = useId();
  const clipId = `${filterId}-clip`;
  if (sport === 'swim') return <SportIcon sport={sport} size={size} perspective="rear" className={className} {...props} />;

  const cellX = CELL_X[sport];
  const reference = sport === 'indoor-bike'
    ? { href: indoorBikeReference, width: 137, height: 167, viewBox: '8 12 120 120', clipX: 12, clipY: 16, clipWidth: 110, clipHeight: 116 }
    : { href: pixelReference, width: 688, height: 184, viewBox: `${cellX - 2} 31 120 120`, clipX: cellX + 4, clipY: 33, clipWidth: 108, clipHeight: 116 };
  return (
    <svg width={size} height={size} viewBox={reference.viewBox} preserveAspectRatio="xMidYMid meet"
      aria-hidden="true" focusable="false" className={['home-activity-sport-icon', className].filter(Boolean).join(' ')} {...props}>
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse"><rect x={reference.clipX} y={reference.clipY} width={reference.clipWidth} height={reference.clipHeight} /></clipPath>
        <filter id={filterId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          {/* 원본 RGB는 유지한다. 밝은 체크 배경만 alpha로 제거하고 경계는 부드럽게 연결한다. */}
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -2.126 -7.152 -0.722 0 8" result="coloredInk" />
          <feComposite in="coloredInk" in2="SourceAlpha" operator="in" />
        </filter>
      </defs>
      <image href={reference.href} width={reference.width} height={reference.height} filter={`url(#${filterId})`} clipPath={`url(#${clipId})`} imageRendering="pixelated" />
    </svg>
  );
}
