import { Box, Text } from '@mantine/core'
import StatTile from './StatTile'
import WeekBars from './WeekBars'
import YearProgressBar from './YearProgressBar'
import NextServiceTile from './NextServiceTile'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import { formatPercentChange } from '../../utils/stats'
import type { DashboardAttentionItem, DashboardStats } from '../../types/models'

// 'YYYY-MM-DD' read as a local calendar date (new Date('2026-11-01') would
// be UTC midnight, i.e. the previous day west of Greenwich).
function localDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export default function SummaryTiles({ stats, attention }: { stats: DashboardStats; attention: DashboardAttentionItem[] }) {
  const { week, month, year_to_date: ytd } = stats
  const monthName = localDate(month.start_date).toLocaleDateString(undefined, { month: 'long' })
  const lastYear = Number(stats.today.slice(0, 4)) - 1
  const change = formatPercentChange(ytd.distance_meters, ytd.last_year_to_date_distance_meters)

  return (
    <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--mantine-spacing-md)' }}>
      <StatTile
        label="This week"
        value={formatDistance(week.distance_meters)}
        secondary={`${formatDuration(week.moving_time_seconds)} · ${formatElevation(week.elevation_gain_meters)} ↑`}
        aside={<WeekBars daily={week.daily} today={stats.today} />}
      />

      <StatTile
        label={monthName}
        value={formatDistance(month.distance_meters)}
        secondary={`${formatDuration(month.moving_time_seconds)} · ${formatElevation(month.elevation_gain_meters)} ↑ · ${month.ride_count} ${month.ride_count === 1 ? 'ride' : 'rides'}`}
      />

      <StatTile
        label="Year to date"
        value={
          <>
            {formatDistance(ytd.distance_meters)}
            {change && (
              <Text span size="sm" fw={500} ml="xs" c={change.up ? 'var(--mantine-primary-color-filled)' : 'dimmed'}>
                {change.text} vs {lastYear}
              </Text>
            )}
          </>
        }
      >
        <YearProgressBar
          current={ytd.distance_meters}
          lastYearToDate={ytd.last_year_to_date_distance_meters}
          lastYearTotal={ytd.last_year_total_distance_meters}
        />
        <Text size="sm" c="dimmed">
          Last year by today: {formatDistance(ytd.last_year_to_date_distance_meters)}
        </Text>
      </StatTile>

      <NextServiceTile attention={attention} />
    </Box>
  )
}
