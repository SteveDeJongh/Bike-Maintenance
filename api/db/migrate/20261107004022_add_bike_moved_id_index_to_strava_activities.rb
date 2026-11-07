class AddBikeMovedIdIndexToStravaActivities < ActiveRecord::Migration[7.1]
  def change
    # Backs Bikes::RideHistory's window-function query -- WHERE bike_id = ?
    # ORDER BY moved_at, id (the window's own tie-broken chronological
    # order) and the outer pagination query's same ordering, both
    # satisfiable from this index alone.
    add_index :strava_activities, [:bike_id, :moved_at, :id], name: "index_strava_activities_on_bike_moved_id"
  end
end
