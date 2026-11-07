module Bikes
  # A bike's rides, newest-first by default, each carrying a running
  # odometer (cumulative_distance_meters: the bike's total distance up to
  # and including that ride, in chronological order -- a bike odometer,
  # not component mileage, so it always counts every ride including
  # indoor, exactly like Bike#total_distance). The window function that
  # computes it only needs (id, cumulative_distance_meters) -- real
  # StravaActivity records are then hydrated for those ids, so every other
  # field (including nulls) comes straight from the model's own typing
  # instead of hand-casting raw SQL rows.
  class RideHistory
    DEFAULT_PER_PAGE = 50
    MAX_PER_PAGE = 200

    Result = Struct.new(:rides, :cumulative_by_id, :total_count, :total_distance_meters, :page, :per_page, keyword_init: true) do
      def next_page
        page * per_page < total_count ? page + 1 : nil
      end
    end

    def self.call(bike, type: "all", order: "desc", page: 1, per_page: nil)
      new(bike, type, order, page, per_page).call
    end

    def initialize(bike, type, order, page, per_page)
      @bike = bike
      @type = %w[outdoor indoor].include?(type) ? type : "all"
      @order = order == "asc" ? "ASC" : "DESC"
      @page = [page.to_i, 1].max
      @per_page = per_page.present? ? per_page.to_i.clamp(1, MAX_PER_PAGE) : DEFAULT_PER_PAGE
    end

    def call
      rows = ActiveRecord::Base.connection.exec_query(page_sql).to_a
      ride_ids = rows.map { |row| row["id"].to_i }
      cumulative_by_id = rows.each_with_object({}) { |row, hash| hash[row["id"].to_i] = row["cumulative_distance_meters"].to_i }

      activities_by_id = StravaActivity.where(id: ride_ids).index_by(&:id)
      rides = ride_ids.map { |id| activities_by_id[id] }

      Result.new(
        rides: rides,
        cumulative_by_id: cumulative_by_id,
        total_count: meta_scope.count,
        total_distance_meters: meta_scope.sum(:distance_meters),
        page: page,
        per_page: per_page,
      )
    end

    private

    attr_reader :bike, :type, :order, :page, :per_page

    def meta_scope
      scope = StravaActivity.where(bike_id: bike.id)
      scope = scope.outdoor if type == "outdoor"
      scope = scope.indoor if type == "indoor"
      scope
    end

    def type_filter_sql
      case type
      when "outdoor" then "WHERE #{Maintenance::RideContextSql.outdoor_predicate(activity_alias: 'ordered')}"
      when "indoor" then "WHERE #{Maintenance::RideContextSql.indoor_predicate(activity_alias: 'ordered')}"
      else ""
      end
    end

    # The window's own ORDER BY is always chronological ASC with id as the
    # tie-break -- fixed, regardless of order/page -- so
    # cumulative_distance_meters is correct no matter which page or display
    # order is requested. The outer ORDER BY/LIMIT/OFFSET is the
    # user-requested page/order; the type filter applies here, after the
    # window function, so a filtered page's odometer values still reflect
    # every ride on the bike.
    def page_sql
      <<~SQL
        WITH ordered AS (
          SELECT sa.id, sa.moved_at, sa.trainer, sa.activity_type,
            SUM(sa.distance_meters) OVER (ORDER BY sa.moved_at ASC, sa.id ASC) AS cumulative_distance_meters
          FROM strava_activities sa
          WHERE sa.bike_id = #{bike.id.to_i}
        )
        SELECT id, cumulative_distance_meters
        FROM ordered
        #{type_filter_sql}
        ORDER BY moved_at #{order}, id #{order}
        LIMIT #{per_page} OFFSET #{(page - 1) * per_page}
      SQL
    end
  end
end
