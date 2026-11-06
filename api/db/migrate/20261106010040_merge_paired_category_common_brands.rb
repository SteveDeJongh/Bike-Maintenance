class MergePairedCategoryCommonBrands < ActiveRecord::Migration[7.1]
  PAIRS = [
    %w[tire_front tire_rear],
    %w[wheel_front wheel_rear],
    %w[brake_pads_front brake_pads_rear],
  ].freeze

  # A migration-local model, not the live app one -- same reasoning as
  # 20261106002720_add_common_brands_to_component_category_settings.rb:
  # isolates this one-time merge from the live model's setter/validations.
  class ComponentCategorySettingForMigration < ActiveRecord::Base
    self.table_name = "component_category_settings"
  end

  def up
    user_ids = ComponentCategorySettingForMigration.distinct.pluck(:user_id)

    user_ids.each do |user_id|
      PAIRS.each do |front_category, rear_category|
        front = ComponentCategorySettingForMigration.find_or_create_by!(user_id: user_id, category: front_category)
        rear = ComponentCategorySettingForMigration.find_or_create_by!(user_id: user_id, category: rear_category)

        merged = merge_case_insensitive(front.common_brands + rear.common_brands)

        front.update_columns(common_brands: merged)
        rear.update_columns(common_brands: merged)
      end
    end
  end

  def down
    # No-op -- the merge is a strict union of each row's prior brands, so
    # there's nothing meaningful to revert to.
  end

  private

  def merge_case_insensitive(brands)
    brands.uniq { |brand| brand.downcase }
  end
end
