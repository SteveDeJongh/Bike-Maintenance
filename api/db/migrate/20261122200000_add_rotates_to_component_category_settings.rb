# Whether a category's components rotate on a bike (two waxed chains
# swapped back and forth), which gates the dashboard's rotation strip.
# Backfilled true for every existing chain row only -- the one category
# rotated today; Users::Provision::ROTATES_CATEGORIES mirrors this for new
# users. A user with no chain row (or a custom category) keeps the default.
class AddRotatesToComponentCategorySettings < ActiveRecord::Migration[7.1]
  def up
    add_column :component_category_settings, :rotates, :boolean, null: false, default: false
    execute "UPDATE component_category_settings SET rotates = true WHERE category = 'chain'"
  end

  def down
    remove_column :component_category_settings, :rotates
  end
end
