class CreateComponentCategorySettings < ActiveRecord::Migration[7.1]
  OUTDOOR_ONLY_CATEGORIES = %w[
    cassette tire_front tire_rear wheel_front wheel_rear
    brake_pads_front brake_pads_rear
  ].freeze

  ACCRUES_INDOOR_CATEGORIES = %w[
    chain chainring bottom_bracket handlebar_tape saddle
  ].freeze

  def change
    create_table :component_category_settings do |t|
      t.references :user, null: false, foreign_key: true
      t.string :category, null: false
      t.boolean :accrues_indoor_mileage, null: false

      t.timestamps
    end
    add_index :component_category_settings, [ :user_id, :category ], unique: true

    # Seed a sensible, fully user-editable starting point for every existing
    # user, matching the classification given when this feature was designed
    # (components that don't spin/wear the same way on a trainer default to
    # outdoor-only; touchpoint/rotating parts default to accruing everywhere).
    # This is initial data, not a hardcoded rule -- every row is editable via
    # GET/PATCH /component_category_settings afterward.
    reversible do |dir|
      dir.up do
        category_rows = (
          OUTDOOR_ONLY_CATEGORIES.map { |c| "SELECT '#{c}' AS category, FALSE AS accrues_indoor_mileage" } +
          ACCRUES_INDOOR_CATEGORIES.map { |c| "SELECT '#{c}' AS category, TRUE AS accrues_indoor_mileage" }
        ).join(" UNION ALL ")

        execute <<~SQL
          INSERT INTO component_category_settings (user_id, category, accrues_indoor_mileage, created_at, updated_at)
          SELECT users.id, categories.category, categories.accrues_indoor_mileage, NOW(), NOW()
          FROM users
          CROSS JOIN (#{category_rows}) AS categories
          ON CONFLICT (user_id, category) DO NOTHING
        SQL
      end
    end
  end
end
