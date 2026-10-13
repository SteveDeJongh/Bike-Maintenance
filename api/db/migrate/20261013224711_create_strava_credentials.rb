class CreateStravaCredentials < ActiveRecord::Migration[7.1]
  def change
    create_table :strava_credentials do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.string :access_token, null: false
      t.string :refresh_token, null: false
      t.bigint :athlete_id, null: false
      t.datetime :expires_at, null: false
      t.string :scope

      t.timestamps
    end
  end
end
