class AddIgnoredAtToStravaGears < ActiveRecord::Migration[7.1]
  def change
    add_column :strava_gears, :ignored_at, :datetime
  end
end
