class RemoveShockRenameRearShockToRearSuspension < ActiveRecord::Migration[7.1]
  # Migration-local models, not the live app ones -- same reasoning as the
  # earlier migrations touching these tables: isolates this one-time fix
  # from the live models' own validations/setters where it doesn't need them.
  class ComponentCategorySettingForMigration < ActiveRecord::Base
    self.table_name = "component_category_settings"
  end

  class BikeTypeForMigration < ActiveRecord::Base
    self.table_name = "bike_types"
  end

  def up
    ComponentCategorySettingForMigration.where(category: "rear_shock").update_all(category: "rear_suspension")
    ComponentCategorySettingForMigration.where(category: "shock").destroy_all

    BikeTypeForMigration.find_each do |bike_type|
      next unless bike_type.default_categories.include?("shock")

      bike_type.update_columns(
        default_categories: bike_type.default_categories.map { |c| c == "shock" ? "rear_suspension" : c },
      )
    end

    # Mirror front_suspension's current brands onto rear_suspension right
    # away, rather than leaving the pair to drift until the next edit --
    # same reasoning as MergePairedCategoryCommonBrands. Goes through the
    # live ComponentCategorySettings::UpdateCommonBrands service (not a
    # migration-local reimplementation) since it's already the single
    # source of truth for "write + mirror to partner" and depends on
    # nothing this migration changes.
    ComponentCategorySettingForMigration.where(category: "front_suspension").find_each do |front|
      ComponentCategorySettings::UpdateCommonBrands.call(
        user: User.find(front.user_id), category: "front_suspension", brands: front.common_brands,
      )
    end
  end

  def down
    # No-op -- shock's data is intentionally discarded (dropped per explicit
    # request, not preserved), and the rename/pairing isn't meaningfully
    # reversible either.
  end
end
