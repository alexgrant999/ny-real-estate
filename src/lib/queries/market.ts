import { getDb } from '../db';

export function getMarketAreas(areaType?: string): { area_name: string; borough: string; area_type: string }[] {
  const db = getDb();
  if (areaType) {
    return db.prepare(`
      SELECT DISTINCT area_name, borough, area_type
      FROM market_trends
      WHERE area_type = ?
      ORDER BY borough, area_name
    `).all(areaType) as { area_name: string; borough: string; area_type: string }[];
  }
  return db.prepare(`
    SELECT DISTINCT area_name, borough, area_type
    FROM market_trends
    ORDER BY borough, area_name
  `).all() as { area_name: string; borough: string; area_type: string }[];
}

export function getMarketTrend(
  areaName: string,
  metrics: string[],
  fromPeriod?: string,
): { period: string; metric: string; value: number }[] {
  const db = getDb();
  const placeholders = metrics.map(() => '?').join(',');
  const params: (string | number)[] = [areaName, ...metrics];
  let extra = '';
  if (fromPeriod) {
    extra = ' AND period >= ?';
    params.push(fromPeriod);
  }
  return db.prepare(`
    SELECT period, metric, value
    FROM market_trends
    WHERE area_name = ? AND metric IN (${placeholders})${extra}
    ORDER BY period ASC
  `).all(...params) as { period: string; metric: string; value: number }[];
}

export function getMarketTrendCount(): number {
  const db = getDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM market_trends').get() as { count: number };
  return result.count;
}
