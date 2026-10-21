import type { SVGProps } from 'react';
import type { HomeActivitySport } from '../../utils/homeActivitySport';
import SportIcon from './SportIcon';
import './HomeActivitySportIcon.css';
import { ICON_SIZE } from '../../theme/tokens/icon';

type HomeActivitySportIconProps = SVGProps<SVGSVGElement> & {
  sport: HomeActivitySport;
  size?: number;
};

/** 세부 종목 이름은 유지하고 그림은 기존 Material 기본 종목 아이콘을 사용한다. */
export default function HomeActivitySportIcon({ sport, size = ICON_SIZE.xl, className, ...props }: HomeActivitySportIconProps) {
  const discipline = sport === 'mtb' || sport === 'indoor-bike' ? 'bike' : sport === 'trekking' ? 'run' : sport;
  return <SportIcon sport={discipline} size={size} className={['home-activity-sport-icon', className].filter(Boolean).join(' ')} {...props} />;
}
