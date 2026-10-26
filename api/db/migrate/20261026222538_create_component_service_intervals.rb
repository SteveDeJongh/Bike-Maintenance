class CreateComponentServiceIntervals < ActiveRecord::Migration[7.1]
  def change
    create_table :component_service_intervals do |t|
      t.references :component, null: false, foreign_key: true
      t.references :category_service_interval, foreign_key: true # nullable -- null = custom, not linked to a template
      t.references :service_type, null: false, foreign_key: true
      t.integer :distance_interval_meters
      t.integer :time_interval_days
      t.boolean :enabled, null: false, default: true

      t.timestamps
    end

    add_index :component_service_intervals, [ :component_id, :service_type_id ], unique: true,
      name: "index_csi_on_component_and_service_type"
  end
end
