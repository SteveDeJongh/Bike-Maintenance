class CreateMaintenanceEvents < ActiveRecord::Migration[7.1]
  def change
    create_table :maintenance_events do |t|
      t.references :component, null: false, foreign_key: true
      t.string :event_type
      t.date :performed_on
      t.text :notes

      t.timestamps
    end
  end
end
