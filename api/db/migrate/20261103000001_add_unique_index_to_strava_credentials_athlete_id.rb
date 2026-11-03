class AddUniqueIndexToStravaCredentialsAthleteId < ActiveRecord::Migration[7.1]
  def change
    add_index :strava_credentials, :athlete_id, unique: true
  end
end
