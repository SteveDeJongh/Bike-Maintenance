class AddRequirementColumnsAndSatisfiersTable < ActiveRecord::Migration[7.1]
  def change
    rename_table :category_service_intervals, :category_service_requirements
    rename_table :component_service_intervals, :component_service_requirements

    rename_column :component_service_requirements, :category_service_interval_id, :category_service_requirement_id
    rename_column :service_alert_dismissals, :component_service_interval_id, :component_service_requirement_id

    rename_column :category_service_requirements, :distance_interval_meters, :distance_meters
    rename_column :component_service_requirements, :distance_interval_meters, :distance_meters

    # Nullable for now -- backfilled by the next migration, then tightened
    # to NOT NULL (on category_service_requirements only -- a component
    # row's name stays nullable forever, since nil there means "inherit the
    # template") by the migration after that.
    add_column :category_service_requirements, :name, :string
    add_column :category_service_requirements, :moving_time_seconds, :integer
    add_column :category_service_requirements, :calendar_amount, :integer
    add_column :category_service_requirements, :calendar_unit, :string
    add_column :category_service_requirements, :ride_filter, :string, null: false, default: "all"

    add_column :component_service_requirements, :name, :string
    add_column :component_service_requirements, :moving_time_seconds, :integer
    add_column :component_service_requirements, :calendar_amount, :integer
    add_column :component_service_requirements, :calendar_unit, :string
    add_column :component_service_requirements, :ride_filter, :string

    create_table :service_requirement_satisfiers do |t|
      t.string :owner_type, null: false
      t.bigint :owner_id, null: false
      t.references :service_type, null: false, foreign_key: true
      t.integer :position, null: false
      t.integer :allowance_distance_meters
      t.integer :allowance_moving_time_seconds
      t.integer :allowance_calendar_amount
      t.string :allowance_calendar_unit

      t.timestamps
    end
    add_index :service_requirement_satisfiers, [ :owner_type, :owner_id, :service_type_id ],
      unique: true, name: "index_satisfiers_on_owner_and_service_type"
    add_index :service_requirement_satisfiers, [ :owner_type, :owner_id, :position ],
      name: "index_satisfiers_on_owner_and_position"

    # Replaces the old (user_id, category, service_type_id) / (component_id,
    # service_type_id) uniqueness -- a requirement is no longer identified by
    # a single service type. Safe to add now (before the backfill): multiple
    # NULLs in `name` never collide under a unique index.
    add_index :category_service_requirements, "user_id, category, lower(name)",
      unique: true, name: "index_csr_on_user_category_lower_name"
    add_index :component_service_requirements, [ :component_id, :category_service_requirement_id ],
      unique: true, where: "category_service_requirement_id IS NOT NULL",
      name: "index_csr_on_component_and_requirement_linked"
    add_index :component_service_requirements, "component_id, lower(name)",
      unique: true, where: "category_service_requirement_id IS NULL",
      name: "index_csr_on_component_and_lower_name_custom"
  end
end
