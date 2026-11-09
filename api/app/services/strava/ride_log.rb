module Strava
  # The cross-bike "Rides" tab: unattributed (needing attention or ignored)
  # rides, or every ride, paginated/sorted/filtered. Unlike Bikes::RideHistory
  # there's no per-bike odometer to compute, so this is plain ActiveRecord --
  # no raw SQL/window function needed.
  class RideLog
    DEFAULT_PER_PAGE = 50
    MAX_PER_PAGE = 200
    STATUSES = %w[attention ignored all].freeze
    SORT_COLUMNS = { "date" => "moved_at", "distance" => "distance_meters" }.freeze

    Result = Struct.new(:rides, :total_count, :total_distance_meters, :status_counts, :page, :per_page, keyword_init: true) do
      def next_page
        page * per_page < total_count ? page + 1 : nil
      end
    end

    def self.call(user, status: "attention", bike_id: nil, sort: "date", order: "desc", page: 1, per_page: nil)
      new(user, status, bike_id, sort, order, page, per_page).call
    end

    def initialize(user, status, bike_id, sort, order, page, per_page)
      @user = user
      @status = STATUSES.include?(status) ? status : "attention"
      @bike_id = bike_id
      @sort_column = SORT_COLUMNS.fetch(sort, "moved_at")
      @order = order == "asc" ? :asc : :desc
      @page = [page.to_i, 1].max
      @per_page = per_page.present? ? per_page.to_i.clamp(1, MAX_PER_PAGE) : DEFAULT_PER_PAGE
    end

    def call
      scope = base_scope
      rides = scope.order(@sort_column => @order, id: @order)
        .offset((@page - 1) * @per_page).limit(@per_page).to_a

      Result.new(
        rides: rides,
        total_count: scope.count,
        total_distance_meters: scope.sum(:distance_meters),
        status_counts: status_counts,
        page: @page,
        per_page: @per_page,
      )
    end

    private

    attr_reader :user, :status, :bike_id

    def ignored_gear_ids
      @ignored_gear_ids ||= StravaGear.ignored_for(user).pluck(:strava_gear_id)
    end

    def base_scope
      case status
      when "attention" then StravaActivity.needs_attention_for(user, ignored_gear_ids: ignored_gear_ids)
      when "ignored" then StravaActivity.ignored_for(user, ignored_gear_ids: ignored_gear_ids)
      else
        scope = user.strava_activities
        scope = scope.where(bike_id: bike_id) if bike_id.present?
        scope
      end
    end

    def status_counts
      {
        attention: StravaActivity.needs_attention_for(user, ignored_gear_ids: ignored_gear_ids).count,
        ignored: StravaActivity.ignored_for(user, ignored_gear_ids: ignored_gear_ids).count,
        all: user.strava_activities.count,
      }
    end
  end
end
