class CreateBikes < ActiveRecord::Migration[7.1]
  def change
    create_table :bikes do |t|
      t.string :name
      t.string :make
      t.string :model
      t.string :strava_gear_id
      t.date :retired_on

      t.timestamps
    end
  end
end
