import { useTranslation } from 'react-i18next';
import { DistributionStrip, type DistributionItem } from '../../../theme/components';
import type { CriticalBand, SeilerZoneDistribution } from './metricsPresentation';

const validSeconds = (values: readonly number[]) => values.every(value => Number.isFinite(value) && value >= 0);
const clock = (seconds: number) => {
  const s = Math.round(seconds);
  return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** Use the metric producer's zone total, never the potentially different overview total. */
export function criticalDistribution(bands: readonly CriticalBand[] | null | undefined, powerSeconds: readonly number[] | undefined) {
  if (bands?.length !== 4 || !['Sweet Spot', 'Threshold', 'VO2max', 'Anaerobic'].every(label => bands.some(band => band.label === label)) || !powerSeconds?.length || !validSeconds(powerSeconds) || !validSeconds(bands.map(band => band.seconds))) return null;
  const total = powerSeconds.reduce((sum, seconds) => sum + seconds, 0);
  const used = bands.reduce((sum, band) => sum + band.seconds, 0);
  if (total <= 0 || used > total) return null;
  return { total, remainder: total - used };
}

export function PowerZoneReadings({ seiler, bands, powerSeconds }: {
  seiler?: SeilerZoneDistribution[] | null; bands?: CriticalBand[] | null; powerSeconds?: number[];
}) {
  const { t } = useTranslation('activity');
  const detail = (seconds: number, total: number, range: string) => `${clock(seconds)} · ${(seconds / total * 100).toFixed(1)}% · ${range}`;
  const seilerTotal = seiler?.reduce((sum, row) => sum + row.seconds, 0) ?? 0;
  const seilerItems: DistributionItem[] = seiler && seilerTotal > 0 && validSeconds(seiler.map(row => row.seconds)) ? seiler.map(row => ({
    id: `seiler-${row.zone}`, label: t(`analysis.seiler.z${row.zone}`), weight: row.seconds, color: row.color,
    detail: detail(row.seconds, seilerTotal, t(`analysisReading.seilerRange${row.zone}`)),
  })) : [];
  const distribution = criticalDistribution(bands, powerSeconds);
  const bandKeys: Record<string, string> = { 'Sweet Spot': 'sweetSpot', Threshold: 'threshold', VO2max: 'vo2', Anaerobic: 'anaerobic' };
  const criticalItems: DistributionItem[] = distribution && bands ? [
    { id: 'below', unlabelled: true, label: t('analysisReading.below83'), weight: distribution.remainder, color: 'var(--bg-3)', detail: detail(distribution.remainder, distribution.total, t('analysisReading.below83Range')) },
    ...bands.map(band => ({ id: band.label, label: bandKeys[band.label] ? t(`analysisReading.band.${bandKeys[band.label]}`) : band.label, weight: band.seconds, color: band.label === 'Anaerobic' ? 'var(--zone-6)' : band.color, detail: detail(band.seconds, distribution.total, `${band.label === 'Anaerobic' ? '≥120% FTP' : band.range} · ${t('analysisReading.ftpBasis')}`) })),
  ] : [];
  if (!seilerItems.length && !criticalItems.length) return null;
  return <div className="activity-power-zone-readings">
    {seilerItems.length > 0 && <DistributionStrip label={t('analysis.seiler.title')} items={seilerItems} />}
    {criticalItems.length > 0 && <DistributionStrip label={t('analysisReading.ftpBands')} items={criticalItems} />}
  </div>;
}
