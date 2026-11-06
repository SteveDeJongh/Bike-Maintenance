module ComponentCategorySettings
  # Sets category's common_brands to brands, and mirrors the exact same
  # array onto its paired partner (if any) in the same transaction -- the
  # one place that writes common_brands, used directly by the Settings
  # controller and by AddCommonBrand. Bang methods throughout: this column
  # has no validation that can realistically fail, and if it somehow does,
  # the whole transaction (both sides of a pair) should roll back together
  # rather than leave one side updated and the other not.
  class UpdateCommonBrands
    def self.call(user:, category:, brands:)
      new(user, category, brands).call
    end

    def initialize(user, category, brands)
      @user = user
      @category = category
      @brands = brands
    end

    def call
      ActiveRecord::Base.transaction do
        setting = ComponentCategorySetting.find_or_create_by!(user: user, category: category)
        setting.update!(common_brands: brands)
        sync_partner!
        setting
      end
    end

    private

    attr_reader :user, :category, :brands

    # Writes the partner directly rather than recursing into .call, so there
    # is no callback-loop risk to guard against.
    def sync_partner!
      partner_category = ComponentCategorySetting.brand_list_partner(category)
      return unless partner_category

      partner = ComponentCategorySetting.find_or_create_by!(user: user, category: partner_category)
      partner.update!(common_brands: brands)
    end
  end
end
