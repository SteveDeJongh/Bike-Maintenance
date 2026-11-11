class AddIndexesForActivityFeed < ActiveRecord::Migration[7.1]
  def change
    # Activity::Feed is the first caller that needs strava_activities
    # ordered/filtered by user across every bike at once -- every existing
    # index on this table is bike_id-scoped, because every existing caller
    # (Bikes::RideHistory, Strava::RideLog's bike_id filter) is too.
    add_index :strava_activities, [ :user_id, :moved_at, :id ], name: "index_strava_activities_on_user_moved_id"

    add_index :service_sessions, [ :user_id, :performed_at, :id ], name: "index_service_sessions_on_user_performed_id"
    add_index :maintenance_events, [ :performed_at, :id ], where: "service_session_id IS NULL",
      name: "index_maintenance_events_on_performed_id_sessionless"
    add_index :component_assignments, [ :bike_id, :started_at ], name: "index_component_assignments_on_bike_started"
    add_index :component_assignments, [ :bike_id, :ended_at ], where: "ended_at IS NOT NULL",
      name: "index_component_assignments_on_bike_ended"
  end
end
