module Activity
  # The /activity page's one data source: a user's rides, service (sessions
  # and session-less events alike), and setup changes (installs/removals,
  # merged into "replaced" where they're the same swap) on one timeline.
  #
  # Two branches, not one mechanism forced to cover both: the default
  # date-ordered case is a raw-SQL UNION ALL of up to five per-source
  # sub-selects (each projecting just occurred_at/kind/kind_rank/source_id/
  # bike_id -- enough to order, keyset-paginate, and then hydrate real AR
  # records, the same split Bikes::RideHistory already uses), because a
  # union across three tables needs keyset pagination to stay fast and
  # stable as rows accumulate; sort=distance only ever means "rides, sorted
  # by distance" (enforced below), which is a plain offset-paginated
  # StravaActivity query, no union needed.
  #
  # Every hydration query below (StravaActivity/ServiceSession/
  # MaintenanceEvent/ComponentAssignment .where(id: ...)) is safe with no
  # explicit user_id scoping of its own, because every id it's given
  # already came out of a sub-select that was itself scoped to this user --
  # same invariant Bikes::RideHistory's own hydration step relies on.
  class Feed
    class InvalidSortError < StandardError; end

    DEFAULT_PER_PAGE = 50
    MAX_PER_PAGE = 200

    # The three UI-facing kinds (?kinds[]=) each expand to one or more
    # internal source kinds -- service_session and maintenance_event are
    # both "Service" in the UI, so they're one group here.
    KIND_GROUPS = {
      "ride" => %w[ride],
      "service" => %w[service_session maintenance_event],
      "setup" => %w[setup_installed setup_removed],
    }.freeze

    # Tie-break order when occurred_at is exactly equal -- ride, then
    # Service (session or session-less event, same rank since they're the
    # same UI bucket), then setup changes. A documented convention, not a
    # deep semantic claim.
    SOURCE_KIND_RANK = {
      "ride" => 0,
      "service_session" => 1,
      "maintenance_event" => 1,
      "setup_installed" => 2,
      "setup_removed" => 2,
    }.freeze

    Result = Struct.new(:items, :meta, :next_cursor, keyword_init: true)

    def self.call(user, **kwargs)
      new(user, **kwargs).call
    end

    def initialize(user, kinds: nil, bike_id: nil, from: nil, to: nil, tz: nil, q: nil, component_id: nil,
      order: "desc", sort: "date", cursor: nil, page: 1, per_page: nil)
      @user = user
      @kind_groups = Array(kinds).select { |k| KIND_GROUPS.key?(k) }
      @kind_groups = ["ride"] if @kind_groups.empty?
      @bike_id = bike_id.presence
      @component_id = component_id.presence
      @q = q.presence
      @order = order == "asc" ? "ASC" : "DESC"
      @sort = sort == "distance" ? "distance" : "date"
      @cursor = cursor.presence
      @page = [ page.to_i, 1 ].max
      @per_page = per_page.present? ? per_page.to_i.clamp(1, MAX_PER_PAGE) : DEFAULT_PER_PAGE

      zone = (tz.present? && ActiveSupport::TimeZone[tz]) || Time.zone
      @from_time = from.present? ? Date.parse(from).in_time_zone(zone).beginning_of_day.utc : nil
      @to_time = to.present? ? Date.parse(to).in_time_zone(zone).end_of_day.utc : nil

      if @sort == "distance" && @kind_groups != [ "ride" ]
        raise InvalidSortError, "sort=distance is only available when kinds is exactly ['ride']"
      end
    end

    def call
      sort == "distance" ? call_distance_sorted : call_date_ordered
    end

    private

    attr_reader :user, :bike_id, :component_id, :q, :order, :sort, :cursor, :page, :per_page, :from_time, :to_time

    def source_kinds
      @kind_groups.flat_map { |group| KIND_GROUPS.fetch(group) }
    end

    # --- date-ordered (keyset) branch ---

    def call_date_ordered
      rows = fetch_page_rows
      has_more = rows.size > per_page
      rows = rows.first(per_page)

      items = hydrate(rows)
      merge_setup_changes!(items)

      Result.new(items: items, meta: build_meta, next_cursor: has_more && rows.any? ? encode_cursor(rows.last) : nil)
    end

    def fetch_page_rows
      selects = source_kinds.filter_map { |kind| subselect_sql(kind) }
      return [] if selects.empty?

      sql = <<~SQL
        SELECT occurred_at, kind, kind_rank, source_id, bike_id FROM (
          #{selects.join("\nUNION ALL\n")}
        ) feed
        #{cursor_where_sql}
        ORDER BY occurred_at #{order}, kind_rank #{order}, source_id #{order}
        LIMIT #{per_page + 1}
      SQL

      ActiveRecord::Base.connection.exec_query(sql).to_a
    end

    def cursor_where_sql
      return "" unless cursor

      decoded = decode_cursor(cursor)
      return "" unless decoded

      at, rank, id = decoded
      comparator = order == "DESC" ? "<" : ">"
      "WHERE (occurred_at, kind_rank, source_id) #{comparator} (#{quote(at)}, #{rank}, #{id})"
    end

    def encode_cursor(row)
      Base64.urlsafe_encode64("#{row['occurred_at']}|#{row['kind_rank']}|#{row['source_id']}")
    end

    def decode_cursor(cursor)
      at, rank, id = Base64.urlsafe_decode64(cursor).split("|")
      return nil if at.blank? || rank.blank? || id.blank?

      [ at, rank.to_i, id.to_i ]
    rescue ArgumentError
      nil
    end

    # --- distance-sorted (offset) branch -- rides only, enforced in #initialize ---

    def call_distance_sorted
      scope = ride_meta_scope
      total_count = scope.count
      direction = order == "DESC" ? :desc : :asc
      rides = scope.order(distance_meters: direction, id: direction)
        .offset((page - 1) * per_page).limit(per_page).to_a

      ignored_gear_ids = StravaGear.ignored_for(user).pluck(:strava_gear_id)
      items = rides.map { |ride| ride_item(ride, ignored_gear_ids) }

      Result.new(
        items: items,
        meta: build_meta,
        next_cursor: page * per_page < total_count ? (page + 1).to_s : nil,
      )
    end

    # --- per-source-kind SQL (shared by the union above and the kind_counts below) ---

    def subselect_sql(source_kind)
      return nil if q && source_kind != "ride"

      case source_kind
      when "ride" then ride_select
      when "service_session" then service_session_select
      when "maintenance_event" then maintenance_event_select
      when "setup_installed" then setup_installed_select
      when "setup_removed" then setup_removed_select
      end
    end

    def ride_select
      conditions = [ "sa.user_id = #{user.id.to_i}" ]
      conditions << "sa.bike_id = #{bike_id.to_i}" if bike_id
      conditions << "sa.name ILIKE #{quote("%#{q}%")}" if q
      conditions << component_id_ride_exists_sql if component_id
      conditions.concat(date_conditions("sa.moved_at"))

      <<~SQL
        SELECT sa.moved_at AS occurred_at, 'ride' AS kind, #{SOURCE_KIND_RANK['ride']} AS kind_rank, sa.id AS source_id, sa.bike_id AS bike_id
        FROM strava_activities sa
        WHERE #{conditions.join(' AND ')}
      SQL
    end

    def component_id_ride_exists_sql
      <<~SQL.squish
        EXISTS (
          SELECT 1 FROM component_assignments ca
          WHERE ca.bike_id = sa.bike_id AND ca.component_id = #{component_id.to_i}
            AND sa.moved_at >= ca.started_at AND (ca.ended_at IS NULL OR sa.moved_at < ca.ended_at)
            AND #{Maintenance::RideContextSql.predicate(assignment_alias: 'ca', activity_alias: 'sa')}
        )
      SQL
    end

    def service_session_select
      conditions = [ "ss.user_id = #{user.id.to_i}" ]
      conditions << "ss.bike_id = #{bike_id.to_i}" if bike_id
      if component_id
        conditions << "EXISTS (SELECT 1 FROM maintenance_events WHERE service_session_id = ss.id AND component_id = #{component_id.to_i})"
      end
      conditions.concat(date_conditions("ss.performed_at"))

      <<~SQL
        SELECT ss.performed_at AS occurred_at, 'service_session' AS kind, #{SOURCE_KIND_RANK['service_session']} AS kind_rank, ss.id AS source_id, ss.bike_id AS bike_id
        FROM service_sessions ss
        WHERE #{conditions.join(' AND ')}
      SQL
    end

    # bike_id isn't a stored column on a session-less event -- a component's
    # bike changes over time via component_assignments -- so it's resolved
    # at performed_at via a LEFT JOIN LATERAL. Lives in the SQL itself (not
    # a post-hydration lookup) because the bike_id filter needs it too, not
    # just display. A component mounted indoor_only on two bikes at once
    # (the documented shared-cassette case) picks one via LIMIT 1, same
    # "picking one is a display simplification" precedent as Dashboard::Summary.
    def maintenance_event_select
      conditions = [ "c.user_id = #{user.id.to_i}", "me.service_session_id IS NULL" ]
      conditions << "bike_lookup.bike_id = #{bike_id.to_i}" if bike_id
      conditions << "me.component_id = #{component_id.to_i}" if component_id
      conditions.concat(date_conditions("me.performed_at"))

      <<~SQL
        SELECT me.performed_at AS occurred_at, 'maintenance_event' AS kind, #{SOURCE_KIND_RANK['maintenance_event']} AS kind_rank, me.id AS source_id, bike_lookup.bike_id AS bike_id
        FROM maintenance_events me
        JOIN components c ON c.id = me.component_id
        LEFT JOIN LATERAL (
          SELECT ca.bike_id FROM component_assignments ca
          WHERE ca.component_id = me.component_id
            AND me.performed_at >= ca.started_at AND (ca.ended_at IS NULL OR me.performed_at < ca.ended_at)
          ORDER BY ca.started_at DESC LIMIT 1
        ) bike_lookup ON true
        WHERE #{conditions.join(' AND ')}
      SQL
    end

    def setup_installed_select
      conditions = [ "b.user_id = #{user.id.to_i}" ]
      conditions << "ca.bike_id = #{bike_id.to_i}" if bike_id
      conditions << "ca.component_id = #{component_id.to_i}" if component_id
      conditions.concat(date_conditions("ca.started_at"))

      <<~SQL
        SELECT ca.started_at AS occurred_at, 'setup_installed' AS kind, #{SOURCE_KIND_RANK['setup_installed']} AS kind_rank, ca.id AS source_id, ca.bike_id AS bike_id
        FROM component_assignments ca
        JOIN bikes b ON b.id = ca.bike_id
        WHERE #{conditions.join(' AND ')}
      SQL
    end

    def setup_removed_select
      conditions = [ "b.user_id = #{user.id.to_i}", "ca.ended_at IS NOT NULL" ]
      conditions << "ca.bike_id = #{bike_id.to_i}" if bike_id
      conditions << "ca.component_id = #{component_id.to_i}" if component_id
      conditions.concat(date_conditions("ca.ended_at"))

      <<~SQL
        SELECT ca.ended_at AS occurred_at, 'setup_removed' AS kind, #{SOURCE_KIND_RANK['setup_removed']} AS kind_rank, ca.id AS source_id, ca.bike_id AS bike_id
        FROM component_assignments ca
        JOIN bikes b ON b.id = ca.bike_id
        WHERE #{conditions.join(' AND ')}
      SQL
    end

    def date_conditions(column)
      conditions = []
      conditions << "#{column} >= #{quote(from_time)}" if from_time
      conditions << "#{column} <= #{quote(to_time)}" if to_time
      conditions
    end

    def quote(value)
      ActiveRecord::Base.connection.quote(value)
    end

    # --- hydration ---

    def hydrate(rows)
      grouped = rows.group_by { |row| row["kind"] }
      ids_for = ->(kind) { grouped.fetch(kind, []).map { |row| row["source_id"].to_i } }

      rides_by_id = StravaActivity.where(id: ids_for.call("ride")).index_by(&:id)
      sessions_by_id = ServiceSession.includes(maintenance_events: %i[component service_type])
        .where(id: ids_for.call("service_session")).index_by(&:id)
      events_by_id = MaintenanceEvent.includes(:component, :service_type)
        .where(id: ids_for.call("maintenance_event")).index_by(&:id)
      assignment_ids = ids_for.call("setup_installed") + ids_for.call("setup_removed")
      assignments_by_id = ComponentAssignment.includes(:component).where(id: assignment_ids).index_by(&:id)
      ignored_gear_ids = StravaGear.ignored_for(user).pluck(:strava_gear_id)

      rows.filter_map do |row|
        case row["kind"]
        when "ride" then ride_item(rides_by_id[row["source_id"].to_i], ignored_gear_ids)
        when "service_session" then service_session_item(sessions_by_id[row["source_id"].to_i])
        when "maintenance_event" then maintenance_event_item(events_by_id[row["source_id"].to_i], row["bike_id"]&.to_i)
        when "setup_installed" then setup_change_item(assignments_by_id[row["source_id"].to_i], "installed")
        when "setup_removed" then setup_change_item(assignments_by_id[row["source_id"].to_i], "removed")
        end
      end
    end

    def bikes_by_id
      @bikes_by_id ||= user.bikes.index_by(&:id)
    end

    def ride_item(ride, ignored_gear_ids)
      return nil unless ride

      bike = ride.bike_id && bikes_by_id[ride.bike_id]
      Strava::RideSerialization.base_json(ride).symbolize_keys.merge(
        kind: "ride",
        occurred_at: ride.moved_at,
        bike: bike && { id: bike.id, name: bike.name },
        attribution: ride.attribution_status(ignored_gear_ids),
        reason: ride.reason(ignored_gear_ids),
      )
    end

    def service_session_item(session)
      return nil unless session

      bike = bikes_by_id[session.bike_id]
      items = session.maintenance_events.map { |event|
        { component_id: event.component_id, label: event.component.label,
          service_type_name: event.service_type.name, note: event.notes.presence }
      }

      {
        kind: "service_session",
        id: session.id,
        occurred_at: session.performed_at,
        bike: bike && { id: bike.id, name: bike.name },
        notes: session.notes,
        item_count: items.size,
        items: items,
        summary: "Service · #{items.size} #{items.size == 1 ? 'item' : 'items'} on #{bike&.name}",
      }
    end

    def maintenance_event_item(event, bike_id_value)
      return nil unless event

      bike = bike_id_value && bikes_by_id[bike_id_value]
      {
        kind: "maintenance_event",
        id: event.id,
        occurred_at: event.performed_at,
        bike: bike && { id: bike.id, name: bike.name },
        component_id: event.component_id,
        label: event.component.label,
        service_type_name: event.service_type.name,
        note: event.notes.presence,
        summary: "#{event.component.label} · #{event.service_type.name}",
      }
    end

    def setup_change_item(assignment, action)
      return nil unless assignment

      bike = bikes_by_id[assignment.bike_id]
      component = assignment.component

      {
        kind: "setup_change",
        id: assignment.id,
        occurred_at: action == "installed" ? assignment.started_at : assignment.ended_at,
        bike: bike && { id: bike.id, name: bike.name },
        action: action,
        component: { id: component.id, label: component.label },
        replaced_component: nil,
        ride_context: assignment.ride_context == "both" ? nil : assignment.ride_context,
        summary: setup_summary(action, component.label, bike&.name, nil),
        _bike_id: assignment.bike_id,
        _category: component.category,
        _ride_context: assignment.ride_context,
      }
    end

    def setup_summary(action, label, bike_name, replaced_label)
      case action
      when "installed" then "Installed #{label} on #{bike_name}"
      when "removed" then "Removed #{label} from #{bike_name}"
      when "replaced" then "Installed #{label} on #{bike_name}, replacing #{replaced_label}"
      end
    end

    # Merges a removed+installed pair into one "replaced" entry when
    # they're the same slot (bike + category + ride_context) and the
    # install's started_at is within MERGE_TOLERANCE of the removal's
    # ended_at. NOT exact equality: ComponentAssignment's own
    # no_overlapping_assignment_for_bike_slot validation (overlaps? treats
    # an equal boundary as still overlapping, since it only exempts
    # started_at *strictly* greater than the prior ended_at) means a
    # same-slot swap can never actually be created with an exactly equal
    # boundary -- the real swap this feature exists to show always has a
    # small real gap. A tolerance is therefore required for this to ever
    # fire on real data; it's the same small, clock-skew-sized allowance
    # this codebase already uses elsewhere (ServiceSession::FUTURE_TOLERANCE,
    # StravaCredential's refresh buffer), not a loose fuzzy window. A
    # post-hydration, in-memory pass over one page's entries (bounded by
    # per_page) -- a replace pair that straddles an exact page boundary is
    # an accepted, cosmetic limitation, not handled here.
    MERGE_TOLERANCE = 1.minute

    def merge_setup_changes!(items)
      removed_items = items.select { |item| item[:kind] == "setup_change" && item[:action] == "removed" }
      installed_items = items.select { |item| item[:kind] == "setup_change" && item[:action] == "installed" }

      removed_items.each do |removed|
        match = installed_items.find do |installed|
          !installed[:_merged] &&
            installed[:_bike_id] == removed[:_bike_id] &&
            installed[:_category] == removed[:_category] &&
            installed[:_ride_context] == removed[:_ride_context] &&
            installed[:occurred_at] >= removed[:occurred_at] &&
            installed[:occurred_at] - removed[:occurred_at] <= MERGE_TOLERANCE
        end
        next unless match

        match[:action] = "replaced"
        match[:replaced_component] = removed[:component]
        match[:summary] = setup_summary("replaced", match[:component][:label], match[:bike]&.fetch(:name), removed[:component][:label])
        match[:_merged] = true
        items.delete(removed)
      end

      items.each do |item|
        next unless item[:kind] == "setup_change"

        item.delete(:_bike_id)
        item.delete(:_category)
        item.delete(:_ride_context)
        item.delete(:_merged)
      end
    end

    # --- meta: ride totals + per-kind counts, both independent of @kind_groups ---

    def build_meta
      { ride_totals: ride_totals, kind_counts: kind_counts }
    end

    def ride_totals
      scope = ride_meta_scope
      {
        count: scope.count,
        distance_meters: scope.sum(:distance_meters),
        moving_time: scope.sum(:moving_time),
        total_elevation_gain: scope.sum(:total_elevation_gain),
      }
    end

    def ride_meta_scope
      scope = user.strava_activities
      scope = scope.where(bike_id: bike_id) if bike_id
      scope = scope.where("name ILIKE ?", "%#{q}%") if q
      scope = scope.where(moved_at: from_time..) if from_time && !to_time
      scope = scope.where(moved_at: ..to_time) if to_time && !from_time
      scope = scope.where(moved_at: from_time..to_time) if from_time && to_time
      if component_id
        scope = scope.where(
          "EXISTS (SELECT 1 FROM component_assignments ca WHERE ca.bike_id = strava_activities.bike_id " \
          "AND ca.component_id = ? AND strava_activities.moved_at >= ca.started_at " \
          "AND (ca.ended_at IS NULL OR strava_activities.moved_at < ca.ended_at) " \
          "AND #{Maintenance::RideContextSql.predicate(assignment_alias: 'ca', activity_alias: 'strava_activities')})",
          component_id,
        )
      end
      scope
    end

    # Counts the raw entries behind each UI kind, under every filter except
    # kinds itself -- independent of @kind_groups so a chip for a currently
    # hidden kind still shows an accurate count. Deliberately counts
    # pre-merge rows (an install+removal pair counts as 2 here even though
    # it may display as one "replaced" row) -- merging is a display nuance
    # over a bounded page, not a fact about how many underlying events exist.
    def kind_counts
      {
        ride: count_for_source_kinds(KIND_GROUPS["ride"]),
        service: count_for_source_kinds(KIND_GROUPS["service"]),
        setup: count_for_source_kinds(KIND_GROUPS["setup"]),
      }
    end

    def count_for_source_kinds(kinds)
      kinds.sum { |kind| count_for_kind(kind) }
    end

    def count_for_kind(source_kind)
      sql = subselect_sql(source_kind)
      return 0 unless sql

      ActiveRecord::Base.connection.exec_query("SELECT COUNT(*) AS count FROM (#{sql}) t").first["count"].to_i
    end
  end
end
