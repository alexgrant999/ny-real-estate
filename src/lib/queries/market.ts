import { getSql } from '../db';

export async function getMarketAreas(areaType?: string): Promise<{ area_name: string; region: string; area_type: string }[]> {
  const sql = getSql();
  if (areaType) {
    return sql<{ area_name: string; region: string; area_type: string }[]>`
      SELECT DISTINCT area_name, region, area_type
      FROM market_trends
      WHERE area_type = ${areaType}
      ORDER BY region, area_name
    `;
  }
  return sql<{ area_name: string; region: string; area_type: string }[]>`
    SELECT DISTINCT area_name, region, area_type
    FROM market_trends
    ORDER BY region, area_name
  `;
}

export async function getMarketTrend(
  areaName: string,
  metrics: string[],
  fromPeriod?: string,
): Promise<{ period: string; metric: string; value: number }[]> {
  // `IN ()` is a syntax error in Postgres; with no metrics there is nothing to match anyway.
  if (metrics.length === 0) return [];
  const sql = getSql();
  return sql<{ period: string; metric: string; value: number }[]>`
    SELECT period, metric, value
    FROM market_trends
    WHERE area_name = ${areaName} AND metric IN ${sql(metrics)}
      ${fromPeriod ? sql`AND period >= ${fromPeriod}` : sql``}
    ORDER BY period ASC
  `;
}

export async function getMarketTrendCount(): Promise<number> {
  const sql = getSql();
  const [row] = await sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM market_trends`;
  return row.count;
}
