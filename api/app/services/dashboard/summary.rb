module Dashboard
  # Assembles the one GET /dashboard payload entirely from existing
  # services/queries -- no distance or status computation happens here that
  # doesn't already live in Maintenance::RequirementStatus/BatchedPositionQuery,
  # Component.current_bikes_by_component, or StravaGear.unmapped_for.
  class Summary
    def self.call(user, tz: nil)
      new(user, tz: tz).call
    end

    def initialize(user, tz: nil)
      @user = user
      @zone = (tz.present? && ActiveSupport::TimeZone[tz]) || Time.zone
    end

    # Rows in Recent rides and Recent service.
    RECENT_LIMIT = 5
    # Feed rows fetched for Recent service before plain installs/removals
    # are filtered out.
    FEED_HEADROOM = 50

    def call
      {
        sync: sync_section,
        bikes: bikes_section,
        attention: attention_section,
        upcoming: upcoming_section,
        recent_rides: recent_rides_section,
        recent_service: recent_service_section,
        stats: stats_section,
      }
    end

    private

    attr_reader :user, :zone

    def credential
      @credential ||= user.strava_credential
    end

    # Every enabled requirement's status, computed once per request --
    # attention, upcoming and the bike cards all derive from this one list.
    def results
      @results ||= Maintenance::RequirementStatus.for_user(user)
    end

    def bikes_by_component
      @bikes_by_component ||= Component.current_bikes_by_component(user)
    end

    def sync_section
      # StravaActivity.needs_attention_for is the one shared definition of
      # "unattributed and actionable" -- a ride whose gear was explicitly
      # "don't tracked" (and hasn't resurfaced) or that's itself been
      # ride-ignored drops out of this notification entirely, same as if it
      # were attributed. Switching to the shared scope here (rather than this
      # method's own inline query) is what keeps this count, the Rides tab's
      # "Needs attention" view, and its tab badge from ever disagreeing.
      unattributed = StravaActivity.needs_attention_for(user)
      with_gear = unattributed.where.not(gear_id: [ nil, "" ])
      without_gear = unattributed.where(gear_id: [ nil, "" ])

      {
        connected: credential.present?,
        last_synced_at: credential&.last_synced_at,
        rides_total: user.strava_activities.count,
        # Lets the sync strip survive a reload -- useStravaSyncRunner's own
        # `failure` is in-memory only (set from a live poll), so without
        # these the "Sync failed" item would vanish the instant the page
        # refreshes even though the credential still records it. Not
        # exposing last_sync_failed_kind here deliberately -- the strip
        # shows one generic failure line regardless of full vs incremental,
        # leaving the kind-aware detail to the Strava page's own status.
        last_sync_failed_at: credential&.last_sync_failed_at,
        last_sync_error: credential&.last_sync_error,
        last_sync_retry_at: credential&.last_sync_retry_at,
        unattributed: {
          count: unattributed.count,
          distance_meters: unattributed.sum(:distance_meters),
          with_gear: { count: with_gear.count, distance_meters: with_gear.sum(:distance_meters) },
          without_gear: { count: without_gear.count, distance_meters: without_gear.sum(:distance_meters) },
          unmapped_gear_count: StravaGear.unmapped_for(user).count,
        },
      }
    end

    def bikes_section
      distances = user.strava_activities.group(:bike_id).sum(:distance_meters)
      ride_counts = user.strava_activities.group(:bike_id).count
      last_rides = user.strava_activities.group(:bike_id).maximum(:moved_at)
      # The latest ride's sport type per bike, one query for every bike.
      last_ride_types = user.strava_activities.where.not(bike_id: nil)
        .select("DISTINCT ON (bike_id) bike_id, activity_type").order(:bike_id, moved_at: :desc, id: :desc)
        .to_h { |activity| [ activity.bike_id, activity.activity_type ] }
      month_start = Time.current.in_time_zone(zone).beginning_of_month.utc
      this_month_distances = user.strava_activities.where(moved_at: month_start..)
        .group(:bike_id).sum(:distance_meters)

      bikes = user.bikes.where(retired_on: nil).to_a
      worst_results = Maintenance::RequirementStatus.worst_result_by_component(user, results: results)
      card_components = Bikes::CardComponents.call(user, bikes: bikes, worst_results: worst_results)

      bikes.map do |bike|
        {
          id: bike.id,
          name: bike.name,
          total_distance: distances[bike.id] || 0,
          ride_count: ride_counts[bike.id] || 0,
          last_ride_on: last_rides[bike.id],
          last_ride_activity_type: last_ride_types[bike.id],
          distance_this_month: this_month_distances[bike.id] || 0,
        }.merge(card_components[bike.id])
      end
    end

    def up_next
      @up_next ||= Maintenance::UpNext.new(results: results, bikes_by_component: bikes_by_component, credential: credential)
    end

    # Every due and warning requirement on a non-retired component, and the
    # nearest ok ones on mounted parts (Maintenance::UpNext, shared with the
    # bike page). Deliberately broader than the alert banners
    # (Result#banner_eligible?): mounted, notifications and dismissal are
    # flags here, so the UI can label (not hide) those items.
    def attention_section
      up_next.attention
    end

    def upcoming_section
      up_next.upcoming
    end

    # Riding totals for the summary tiles, in the viewer's tz. Every synced
    # ride counts -- no bike, ignored gear and indoor included, since these
    # are riding totals, not wear -- except rides individually ignored via
    # ignored_at. Two queries, whatever the windows: one row of FILTERed
    # aggregates for every total, and one GROUP BY local day for the week's
    # bars. Boundaries are computed here in the zone and passed as UTC.
    def stats_section
      now = Time.current.in_time_zone(zone)
      week_start = now.beginning_of_week(:monday)
      week_end = week_start + 7.days
      month_start = now.beginning_of_month
      month_end = month_start.next_month
      year_start = now.beginning_of_year
      last_year_start = year_start - 1.year
      # ActiveSupport clamps Feb 29 to Feb 28 at the same local time.
      last_year_now = now - 1.year

      scope = user.strava_activities.not_ignored
      aggregates = [
        *window_totals(week_start, week_end),
        *window_totals(month_start, month_end),
        window_aggregate("SUM(distance_meters)", year_start, now),
        window_aggregate("SUM(distance_meters)", last_year_start, last_year_now),
        window_aggregate("SUM(distance_meters)", last_year_start, year_start),
      ]
      # Each column needs its own alias: unaliased they're all "coalesce",
      # and ActiveRecord would cast every one with the first column's type
      # (bigint), truncating the float elevation sums.
      totals = scope.where(moved_at: last_year_start.utc...[ week_end, month_end, now ].max.utc)
        .pick(*aggregates.each_with_index.map { |sql, index| Arel.sql("#{sql} AS stat_#{index}") })
      week_totals = totals[0, 4]
      month_totals = totals[4, 4]
      ytd, last_ytd, last_year_total = totals[8, 3]

      {
        today: now.to_date.iso8601,
        week: totals_payload(week_totals).merge(start_date: week_start.to_date.iso8601, daily: daily_distances(scope, week_start, week_end)),
        month: totals_payload(month_totals).merge(start_date: month_start.to_date.iso8601),
        year_to_date: {
          distance_meters: ytd.to_i,
          last_year_to_date_distance_meters: last_ytd.to_i,
          last_year_total_distance_meters: last_year_total.to_i,
        },
      }
    end

    def window_totals(from, to)
      [
        window_aggregate("SUM(distance_meters)", from, to),
        window_aggregate("SUM(COALESCE(moving_time, 0))", from, to),
        window_aggregate("SUM(COALESCE(total_elevation_gain, 0))", from, to),
        window_aggregate("COUNT(*)", from, to),
      ]
    end

    # Half-open [from, to), like every other window in the app.
    def window_aggregate(aggregate, from, to)
      ActiveRecord::Base.sanitize_sql_array(
        [ "COALESCE(#{aggregate} FILTER (WHERE moved_at >= ? AND moved_at < ?), 0)", from.utc, to.utc ],
      )
    end

    def totals_payload((distance, moving_time, elevation, count))
      {
        distance_meters: distance.to_i,
        moving_time_seconds: moving_time.to_i,
        elevation_gain_meters: elevation.to_f.round(1),
        ride_count: count.to_i,
      }
    end

    # Seven {date, distance_meters}, Mon..Sun, zero-filled, grouped in SQL.
    # The day boundaries (local midnights, DST-aware) come from Ruby's zone
    # data and are bucketed with width_bucket, rather than grouping by
    # `moved_at AT TIME ZONE <name>`: Postgres ships its own tz database,
    # which can disagree with Ruby's (America/Vancouver's 2026 switch to
    # permanent UTC-7 is in one and not the other), and these days have to
    # line up exactly with the week boundary computed above.
    def daily_distances(scope, week_start, week_end)
      day_starts = (0..7).map { |offset| (week_start + offset.days).utc }
      bucket = ActiveRecord::Base.sanitize_sql_array([ "width_bucket(moved_at, ARRAY[?]::timestamp[])", day_starts ])
      by_bucket = scope.where(moved_at: week_start.utc...week_end.utc).group(Arel.sql(bucket)).sum(:distance_meters)

      (0..6).map do |offset|
        { date: (week_start.to_date + offset).iso8601, distance_meters: by_bucket[offset + 1].to_i }
      end
    end

    # The last few rides, newest first -- not a date window.
    def recent_rides_section
      rides = user.strava_activities.order(moved_at: :desc, id: :desc).limit(RECENT_LIMIT).to_a
      bikes_by_id = user.bikes.index_by(&:id)
      rides.map { |ride| recent_ride_payload(ride, bikes_by_id) }
    end

    def recent_ride_payload(ride, bikes_by_id)
      bike = ride.bike_id && bikes_by_id[ride.bike_id]

      {
        id: ride.id,
        moved_at: ride.moved_at,
        name: ride.name,
        activity_type: ride.activity_type,
        distance_meters: ride.distance_meters,
        moving_time: ride.moving_time,
        # Lets "Log service after this ride" prefill the session at the
        # ride's end; nil (Strava omitted it) falls back to moved_at.
        elapsed_time: ride.elapsed_time,
        bike: bike && { id: bike.id, name: bike.name },
        # Present alongside a nil bike specifically for the "fixable via gear
        # mapping" case (same distinction as sync.unattributed.with_gear) --
        # lets the frontend offer "Link gear" only when there's actually a
        # gear id to map, not for a ride Strava itself had no bike set on.
        gear_id: ride.gear_id,
        indoor: ride.indoor?,
      }
    end

    # The last few service entries, straight from Activity::Feed so the
    # entry shape and its server-built summary wording are the activity
    # log's own: service sessions, session-less events, and swaps (the
    # feed's merged "replaced" setup entries). Plain installs/removals are
    # setup, not service, so they're filtered out after the fetch -- the
    # feed has no swaps-only kind, since it merges pairs in memory -- with
    # a page of FEED_HEADROOM rows to filter from.
    def recent_service_section
      Activity::Feed.call(user, kinds: %w[service setup], per_page: FEED_HEADROOM, include_meta: false).items
        .select { |item| item[:kind] != "setup_change" || item[:action] == "replaced" }
        .first(RECENT_LIMIT)
    end
  end
end
