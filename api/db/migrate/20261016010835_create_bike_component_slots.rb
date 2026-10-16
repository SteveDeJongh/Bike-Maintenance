class CreateBikeComponentSlots < ActiveRecord::Migration[7.1]
  def change
    create_table :bike_component_slots do |t|
      t.references :bike, null: false, foreign_key: true
      t.string :category, null: false

      t.timestamps
    end
    add_index :bike_component_slots, [ :bike_id, :category ], unique: true

    # Backfill: a bike's existing assignment history already implies which
    # categories were being tracked on it, so those slots should show up
    # immediately rather than leaving "Installed components" blank for
    # every bike that predates this table.
    reversible do |dir|
      dir.up do
        execute <<~SQL
          INSERT INTO bike_component_slots (bike_id, category, created_at, updated_at)
          SELECT DISTINCT component_assignments.bike_id, components.category, NOW(), NOW()
          FROM component_assignments
          INNER JOIN components ON components.id = component_assignments.component_id
          ON CONFLICT (bike_id, category) DO NOTHING
        SQL
      end
    end
  end
end
