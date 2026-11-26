module Maintenance
  # The Maintenance page's one data source: the user's maintenance events
  # (services), filtered, grouped and paged, each with its distances and the
  # requirements it resets, plus the sessions they belong to and the meta
  # the page's tiles, pills and bands need.
  #
  # One base relation ("matching events", base_sql) serves the page, the
  # counts and the band totals, so every filter applies identically to all
  # of them. The bike an event belongs to is its session's bike, or for a
  # session-less event the bike its component was on at performed_at
  # (EventBikeSql) -- the Bike filter and column both use it.
  #
  # Paging: date order (Month / None grouping) is keyset on
  # (performed_at, COALESCE(service_session_id, 0), id) -- a session's
  # events all share performed_at (ServiceSession#sync_event_performed_at),
  # so they're always contiguous. Component grouping and the field sorts
  # page by offset, as Activity::Feed's metric sorts do.
  #
  # Every distance is batched: EventDistanceQuery for component km at the
  # event (and at each previous same-type event, for "since last"), one
  # grouped query for bike km. Nothing runs per event.
  class EventLog
    class InvalidParamError < StandardError; end

    KINDS = %w[session single].freeze
    GROUPS = %w[month component none].freeze
    SORTS = %w[date component_km since_last].freeze
    DEFAULT_PER_PAGE = 50
    MAX_PER_PAGE = 200

    Result = Struct.new(:events, :sessions, :meta, :next_cursor, keyword_init: true)

    def self.call(user, **kwargs)
      new(user, **kwargs).call
    end

    def initialize(user, kinds: nil, bike_id: nil, category: nil, service_type_id: nil, from: nil, to: nil, tz: nil,
      q: nil, group: nil, sort: nil, order: nil, cursor: nil, page: nil, per_page: nil, service_session_id: nil)
      @user = user
      @kinds = Array(kinds).select { |kind| KINDS.include?(kind) }
      @kinds = KINDS.dup if @kinds.empty?
      @bike_id = bike_id.presence&.to_i
      @category = category.presence
      @service_type_id = service_type_id.presence&.to_i
      @q = q.presence
      # Internal (not a /maintenance_events param): one session's services,
      # for GET /service_sessions/:id.
      @service_session_id = service_session_id.presence&.to_i
      @group = group.presence || "month"
      raise InvalidParamError, "Unknown group: #{@group}. Use one of #{GROUPS.join(', ')}." unless GROUPS.include?(@group)

      @sort = sort.presence || "date"
      raise InvalidParamError, "Unknown sort: #{@sort}. Use one of #{SORTS.join(', ')}." unless SORTS.include?(@sort)

      @order = order == "asc" ? "ASC" : "DESC"
      @cursor = cursor.presence
      @page = [ page.to_i, 1 ].max
      @per_page = per_page.present? ? per_page.to_i.clamp(1, MAX_PER_PAGE) : DEFAULT_PER_PAGE
      @zone = (tz.present? && ActiveSupport::TimeZone[tz]) || Time.zone
      @from_time = from.present? ? Date.parse(from).in_time_zone(@zone).beginning_of_day.utc : nil
      @to_time = to.present? ? Date.parse(to).in_time_zone(@zone).end_of_day.utc : nil
    rescue Date::Error
      raise InvalidParamError, "from/to must be YYYY-MM-DD dates"
    end

    def call
      rows, next_cursor =
        if sort != "date" then field_sorted_page
        elsif group == "component" then component_page
        else keyset_page
        end

      events = build_events(rows)
      Result.new(events: events, sessions: sessions_json(events), meta: meta(events), next_cursor: next_cursor)
    end

    private

    attr_reader :user, :kinds, :bike_id, :category, :service_type_id, :q, :group, :sort, :order, :cursor, :page,
      :per_page, :zone, :from_time, :to_time, :service_session_id

    BIKE_SQL = "COALESCE(ss.bike_id, bike_lookup.bike_id)".freeze
    SESSION_KEY_SQL = "COALESCE(me.service_session_id, 0)".freeze

    def connection
      ActiveRecord::Base.connection
    end

    def quote(value)
      connection.quote(value)
    end

    def select_all(sql)
      connection.exec_query(sql).to_a
    end

    # --- the base relation ---

    def from_sql
      <<~SQL
        FROM maintenance_events me
        JOIN components c ON c.id = me.component_id
        JOIN service_types st ON st.id = me.service_type_id
        LEFT JOIN service_sessions ss ON ss.id = me.service_session_id
        #{EventBikeSql.lateral_join(event_alias: 'me')}
      SQL
    end

    # Every filter, as SQL conditions; `except: [:kinds]` for the kind pills'
    # own counts.
    def conditions(except: [])
      list = [ "c.user_id = #{user.id.to_i}" ]
      unless except.include?(:kinds) || kinds.size == KINDS.size
        list << (kinds == [ "session" ] ? "me.service_session_id IS NOT NULL" : "me.service_session_id IS NULL")
      end
      list << "#{BIKE_SQL} = #{bike_id}" if bike_id
      list << "c.category = #{quote(category)}" if category
      list << "me.service_type_id = #{service_type_id}" if service_type_id
      list << "me.service_session_id = #{service_session_id}" if service_session_id
      list << "me.performed_at >= #{quote(from_time)}" if from_time
      list << "me.performed_at <= #{quote(to_time)}" if to_time
      list << q_condition if q
      list
    end

    # Service type, component label/brand/model, the event's notes or its
    # session's notes -- a session-note match brings in every event in it.
    def q_condition
      pattern = quote("%#{ActiveRecord::Base.sanitize_sql_like(q)}%")
      columns = %w[st.name c.label c.brand c.model me.notes ss.notes]
      "(#{columns.map { |column| "#{column} ILIKE #{pattern}" }.join(' OR ')})"
    end

    def base_sql(except: [])
      "#{from_sql} WHERE #{conditions(except: except).join(' AND ')}"
    end

    # --- paging ---

    def page_columns
      "me.id, #{BIKE_SQL} AS bike_id, to_char(me.performed_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.US') AS cursor_at, " \
        "#{SESSION_KEY_SQL} AS session_key"
    end

    def keyset_page
      where = cursor_condition
      rows = select_all(<<~SQL)
        SELECT #{page_columns}
        #{base_sql}
        #{where ? "AND #{where}" : ''}
        ORDER BY me.performed_at #{order}, session_key #{order}, me.id #{order}
        LIMIT #{per_page + 1}
      SQL
      has_more = rows.size > per_page
      rows = rows.first(per_page)
      [ rows, has_more && rows.any? ? encode_cursor(rows.last) : nil ]
    end

    def cursor_condition
      decoded = decode_cursor
      return nil unless decoded

      at, session_key, id = decoded
      comparator = order == "DESC" ? "<" : ">"
      "(me.performed_at, #{SESSION_KEY_SQL}, me.id) #{comparator} (#{quote(at)}::timestamp, #{session_key}, #{id})"
    end

    def encode_cursor(row)
      Base64.urlsafe_encode64("#{row['cursor_at']}|#{row['session_key']}|#{row['id']}")
    end

    def decode_cursor
      return nil unless cursor

      at, session_key, id = Base64.urlsafe_decode64(cursor).split("|")
      return nil unless at.present? && session_key.present? && id.present?
      return nil unless at.match?(/\A\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}\z/)

      [ at, session_key.to_i, id.to_i ]
    rescue ArgumentError
      nil
    end

    # A band per component (by label), each one's services newest first.
    def component_page
      rows = select_all(<<~SQL)
        SELECT #{page_columns}
        #{base_sql}
        ORDER BY c.label ASC, c.id ASC, me.performed_at #{order}, session_key #{order}, me.id #{order}
        LIMIT #{per_page + 1} OFFSET #{(page - 1) * per_page}
      SQL
      offset_result(rows)
    end

    # Component km / Since last: computed for the whole filtered set, then
    # sorted (nulls last either way, id as the tie-break) and sliced.
    def field_sorted_page
      rows = select_all("SELECT #{page_columns} #{base_sql}")
      values = sort == "component_km" ? component_distances(rows.map { |row| row["id"].to_i }) : since_last(rows.map { |row| row["id"].to_i })
      sign = order == "DESC" ? -1 : 1
      sorted = rows.sort_by do |row|
        value = values[row["id"].to_i]
        [ value.nil? ? 1 : 0, value.nil? ? 0 : sign * value, sign * row["id"].to_i ]
      end
      offset_result(sorted.drop((page - 1) * per_page).first(per_page + 1))
    end

    def offset_result(rows)
      has_more = rows.size > per_page
      [ rows.first(per_page), has_more ? (page + 1).to_s : nil ]
    end

    # --- per-event values (all batched) ---

    def component_distances(event_ids)
      @component_distances ||= {}
      missing = event_ids - @component_distances.keys
      @component_distances.merge!(EventDistanceQuery.call(user, event_ids: missing)) if missing.any?
      @component_distances.slice(*event_ids)
    end

    # { event_id => previous same-type event id on the same component, or
    # nil }, over all the user's events whatever the filters.
    def previous_same_type(event_ids)
      return {} if event_ids.empty?

      select_all(<<~SQL).to_h { |row| [ row["id"].to_i, row["prev_id"]&.to_i ] }
        SELECT id, prev_id FROM (
          SELECT me.id,
            LAG(me.id) OVER (PARTITION BY me.component_id, me.service_type_id ORDER BY me.performed_at, me.id) AS prev_id
          FROM maintenance_events me
          JOIN components c ON c.id = me.component_id AND c.user_id = #{user.id.to_i}
          WHERE me.component_id IN (SELECT component_id FROM maintenance_events WHERE id IN (#{event_ids.join(',')}))
        ) ranked
        WHERE id IN (#{event_ids.join(',')})
      SQL
    end

    # The component's distance since its previous event of the same service
    # type: the difference of its distance at the two events (each counts
    # only the rides its assignments' ride_context allows), nil for the first.
    def since_last(event_ids)
      previous = previous_same_type(event_ids)
      distances = component_distances(event_ids + previous.values.compact)
      event_ids.to_h do |id|
        prev_id = previous[id]
        [ id, prev_id ? distances.fetch(id, 0) - distances.fetch(prev_id, 0) : nil ]
      end
    end

    # The bike's lifetime distance at the event: every ride on it before
    # performed_at, as the bike's ride-history odometer counts.
    def bike_distances(event_ids)
      return {} if event_ids.empty?

      select_all(<<~SQL).to_h { |row| [ row["id"].to_i, row["meters"].to_i ] }
        SELECT me.id, COALESCE(SUM(sa.distance_meters), 0) AS meters
        #{from_sql}
        JOIN strava_activities sa ON sa.bike_id = #{BIKE_SQL} AND sa.moved_at < me.performed_at
        WHERE me.id IN (#{event_ids.join(',')})
        GROUP BY me.id
      SQL
    end

    # { [component_id, service_type_id] => [requirement names] }: each
    # enabled requirement on the component whose effective satisfiers
    # include the type -- today's requirements, through the model's own
    # inheritance (satisfier_owner/effective_name).
    def resets(events)
      component_ids = events.map(&:component_id).uniq
      return {} if component_ids.empty?

      requirements = ComponentServiceRequirement.where(component_id: component_ids, enabled: true)
        .includes(:satisfiers, category_service_requirement: :satisfiers)
      requirements.each_with_object(Hash.new { |hash, key| hash[key] = [] }) do |requirement, by_pair|
        requirement.satisfier_owner.satisfiers.each do |satisfier|
          by_pair[[ requirement.component_id, satisfier.service_type_id ]] << requirement.effective_name
        end
      end
    end

    def bikes_by_id
      @bikes_by_id ||= user.bikes.index_by(&:id)
    end

    def bike_json(bike_id_value)
      bike = bike_id_value && bikes_by_id[bike_id_value.to_i]
      bike && { id: bike.id, name: bike.name }
    end

    def build_events(rows)
      ids = rows.map { |row| row["id"].to_i }
      return [] if ids.empty?

      records = MaintenanceEvent.includes(:component, :service_type).where(id: ids).index_by(&:id)
      distances = component_distances(ids)
      since = since_last(ids)
      bike_km = bike_distances(ids)
      reset_names = resets(records.values)

      rows.filter_map do |row|
        event = records[row["id"].to_i]
        next unless event

        bike = bike_json(row["bike_id"])
        {
          id: event.id,
          performed_at: event.performed_at,
          created_at: event.created_at,
          notes: event.notes.presence,
          service_session_id: event.service_session_id,
          component_id: event.component_id,
          service_type_id: event.service_type_id,
          service_type: { id: event.service_type.id, name: event.service_type.name },
          component: { id: event.component.id, label: event.component.label, category: event.component.category },
          bike: bike,
          component_distance_at_event_meters: distances.fetch(event.id, 0),
          since_last_same_type_meters: since[event.id],
          bike_distance_at_event_meters: bike ? bike_km.fetch(event.id, 0) : nil,
          resets: reset_names.fetch([ event.component_id, event.service_type_id ], []).uniq.sort,
        }
      end
    end

    # The sessions on this page, keyed by id: event_count is every event in
    # the session, matching_count the ones these filters keep ("2 of 3").
    def sessions_json(events)
      ids = events.filter_map { |event| event[:service_session_id] }.uniq
      return {} if ids.empty?

      totals = MaintenanceEvent.where(service_session_id: ids).group(:service_session_id).count
      matching = select_all(<<~SQL).to_h { |row| [ row["sid"].to_i, row["count"].to_i ] }
        SELECT me.service_session_id AS sid, COUNT(*) AS count
        #{base_sql}
        AND me.service_session_id IN (#{ids.join(',')})
        GROUP BY me.service_session_id
      SQL

      user.service_sessions.where(id: ids).to_h do |session|
        [
          session.id,
          {
            id: session.id,
            performed_at: session.performed_at,
            bike: bike_json(session.bike_id),
            notes: session.notes.presence,
            event_count: totals.fetch(session.id, 0),
            matching_count: matching.fetch(session.id, 0),
          },
        ]
      end
    end

    # --- meta ---

    def meta(events)
      {
        total: count_matching,
        kind_counts: kind_counts,
        tiles: tiles,
        month_totals: month_totals(events),
        component_totals: component_totals(events),
      }
    end

    def count_matching
      select_all("SELECT COUNT(*) AS count #{base_sql}").first["count"].to_i
    end

    # Under every filter but kinds: sessions (how many) and single events.
    def kind_counts
      row = select_all(<<~SQL).first
        SELECT COUNT(DISTINCT me.service_session_id) AS sessions,
          COUNT(*) FILTER (WHERE me.service_session_id IS NULL) AS singles
        #{base_sql(except: [ :kinds ])}
      SQL
      { session: row["sessions"].to_i, single: row["singles"].to_i }
    end

    # The tiles ignore the filters: this year (in the viewer's zone), plus
    # the latest service ever.
    def tiles
      year_start = Time.current.in_time_zone(zone).beginning_of_year
      span = "me.performed_at >= #{quote(year_start.utc)} AND me.performed_at < #{quote(year_start.next_year.utc)}"
      owned = "FROM maintenance_events me JOIN components c ON c.id = me.component_id WHERE c.user_id = #{user.id.to_i}"

      year = select_all(<<~SQL).first
        SELECT COUNT(*) AS services, COUNT(DISTINCT me.service_session_id) AS sessions #{owned} AND #{span}
      SQL
      last = select_all("SELECT MAX(me.performed_at) AS last_at #{owned}").first["last_at"]
      top = select_all(<<~SQL).first
        SELECT c.id, c.label, COUNT(*) AS count #{owned} AND #{span}
        GROUP BY c.id, c.label ORDER BY count DESC, c.label ASC, c.id ASC LIMIT 1
      SQL

      {
        services_this_year: year["services"].to_i,
        sessions_this_year: year["sessions"].to_i,
        last_service_at: last && row_time(last),
        most_serviced: top && { component_id: top["id"].to_i, label: top["label"], count: top["count"].to_i },
      }
    end

    # { "2026-11" => { services:, sessions:, components: } } for each local
    # month on this page, over every matching event in it -- so a month
    # spread across Load more pages shows the same totals on each. Month
    # bounds come from Ruby's zone as UTC instants (width_bucket), never
    # AT TIME ZONE.
    def month_totals(events)
      return {} if events.empty?

      months = events.map { |event| event[:performed_at].in_time_zone(zone).beginning_of_month }.uniq.sort
      boundaries = []
      month = months.first
      while month <= months.last
        boundaries << month
        month = (month + 1.month).in_time_zone(zone).beginning_of_month
      end
      boundaries << month
      bucket = ActiveRecord::Base.sanitize_sql_array([ "width_bucket(me.performed_at, ARRAY[?]::timestamp[])", boundaries.map(&:utc) ])

      grouped = select_all(<<~SQL).to_h { |row| [ row["bucket"].to_i, row ] }
        SELECT #{bucket} AS bucket, COUNT(*) AS services,
          COUNT(DISTINCT me.service_session_id) AS sessions, COUNT(DISTINCT me.component_id) AS components
        #{base_sql}
        AND me.performed_at >= #{quote(boundaries.first.utc)} AND me.performed_at < #{quote(boundaries.last.utc)}
        GROUP BY bucket
      SQL

      months.to_h do |start|
        row = grouped[boundaries.index(start) + 1]
        [
          start.strftime("%Y-%m"),
          { services: row ? row["services"].to_i : 0, sessions: row ? row["sessions"].to_i : 0, components: row ? row["components"].to_i : 0 },
        ]
      end
    end

    # { component_id => matching services } for the components on this page.
    def component_totals(events)
      ids = events.map { |event| event[:component_id] }.uniq
      return {} if ids.empty?

      select_all(<<~SQL).to_h { |row| [ row["component_id"].to_s, row["count"].to_i ] }
        SELECT me.component_id, COUNT(*) AS count
        #{base_sql}
        AND me.component_id IN (#{ids.join(',')})
        GROUP BY me.component_id
      SQL
    end

    def row_time(value)
      value.is_a?(Time) ? value : ActiveSupport::TimeZone["UTC"].parse(value.to_s)
    end
  end
end
