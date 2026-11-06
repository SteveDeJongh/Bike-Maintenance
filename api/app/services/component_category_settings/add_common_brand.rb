module ComponentCategorySettings
  # Adds brand to category's common_brands if it isn't already there
  # (case-insensitively) -- called from Component#remember_brand on every
  # save. Add-only: nothing ever calls this to remove a brand, so deleting
  # or retiring a component, or changing its brand away from a value, never
  # touches common_brands. If the user has since removed that brand on the
  # Settings page, saving a component with it again re-adds it -- expected,
  # see CLAUDE.md.
  class AddCommonBrand
    def self.call(user:, category:, brand:)
      new(user, category, brand).call
    end

    def initialize(user, category, brand)
      @user = user
      @category = category
      @brand = brand
    end

    def call
      return if brand.blank?

      setting = ComponentCategorySetting.find_or_create_by!(user: user, category: category)
      return if setting.common_brands.any? { |existing| existing.casecmp?(brand) }

      # Reuses UpdateCommonBrands so a paired category's partner also gets
      # the new brand, through the one shared write-and-mirror path.
      UpdateCommonBrands.call(user: user, category: category, brands: setting.common_brands + [brand])
    end

    private

    attr_reader :user, :category, :brand
  end
end
