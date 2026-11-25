module Maintenance
  # The bike a session-less maintenance event's component was on at
  # performed_at, as a LEFT JOIN LATERAL (alias bike_lookup, column
  # bike_id): the assignment covering performed_at, half-open
  # [started_at, ended_at). A component mounted indoor_only on two bikes at
  # once (the shared-cassette case) picks the latest-started one -- picking
  # one is a display simplification, as Dashboard::Summary does. Shared by
  # Activity::Feed and Maintenance::EventLog, so "the bike at the time"
  # has one definition. A session event's bike is its session's, never
  # this lookup.
  module EventBikeSql
    def self.lateral_join(event_alias:)
      <<~SQL.strip
        LEFT JOIN LATERAL (
          SELECT ca.bike_id FROM component_assignments ca
          WHERE ca.component_id = #{event_alias}.component_id
            AND #{event_alias}.performed_at >= ca.started_at
            AND (ca.ended_at IS NULL OR #{event_alias}.performed_at < ca.ended_at)
          ORDER BY ca.started_at DESC LIMIT 1
        ) bike_lookup ON true
      SQL
    end
  end
end
