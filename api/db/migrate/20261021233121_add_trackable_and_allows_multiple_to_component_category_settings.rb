class AddTrackableAndAllowsMultipleToComponentCategorySettings < ActiveRecord::Migration[7.1]
  def change
    add_column :component_category_settings, :trackable, :boolean, default: true, null: false
    add_column :component_category_settings, :allows_multiple_assignments, :boolean, default: false, null: false

    # Seed the one category the user explicitly described as needing to
    # double up (a dedicated outdoor cassette + a dedicated trainer cassette
    # installed at once) -- every other category keeps the column's `false`
    # default, fully editable afterward via the Settings page.
    reversible do |dir|
      dir.up do
        execute "UPDATE component_category_settings SET allows_multiple_assignments = TRUE WHERE category = 'cassette'"
      end
    end
  end
end
