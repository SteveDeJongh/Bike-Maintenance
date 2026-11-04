class AddNewComponentCategorySettings < ActiveRecord::Migration[7.1]
  # A frozen snapshot, not a reference to Users::Provision -- same convention
  # as 20261017004922_create_component_category_settings.rb's own category
  # lists, so this migration's behavior never drifts if the live app code
  # changes later.
  OUTDOOR_ONLY = %w[front_suspension shock].freeze
  BOTH = %w[frame seat_post power_meter pedals].freeze

  def up
    rows = (
      OUTDOOR_ONLY.map { |c| "SELECT '#{c}' AS category, 'outdoor_only' AS default_ride_context" } +
      BOTH.map { |c| "SELECT '#{c}' AS category, 'both' AS default_ride_context" }
    ).join(" UNION ALL ")

    # ON CONFLICT DO NOTHING is the find-or-create semantics this backfill
    # needs -- a user who already has a custom setting row for one of these
    # exact category keys (e.g. front_suspension) keeps it untouched.
    execute <<~SQL
      INSERT INTO component_category_settings (user_id, category, default_ride_context, created_at, updated_at)
      SELECT users.id, categories.category, categories.default_ride_context, NOW(), NOW()
      FROM users
      CROSS JOIN (#{rows}) AS categories
      ON CONFLICT (user_id, category) DO NOTHING
    SQL
  end

  def down
    categories = (OUTDOOR_ONLY + BOTH).map { |c| "'#{c}'" }.join(", ")
    execute "DELETE FROM component_category_settings WHERE category IN (#{categories})"
  end
end
