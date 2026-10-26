class CreateCategoryServiceIntervals < ActiveRecord::Migration[7.1]
  def change
    create_table :category_service_intervals do |t|
      t.references :user, null: false, foreign_key: true
      t.string :category, null: false
      t.references :service_type, null: false, foreign_key: true
      t.integer :distance_interval_meters
      t.integer :time_interval_days

      t.timestamps
    end

    add_index :category_service_intervals, [ :user_id, :category, :service_type_id ], unique: true,
      name: "index_csi_on_user_category_service_type"
  end
end
