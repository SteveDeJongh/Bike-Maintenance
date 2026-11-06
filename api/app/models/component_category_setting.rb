class ComponentCategorySetting < ApplicationRecord
  belongs_to :user

  # The only categories whose common_brands list is shared rather than
  # independent -- see ComponentCategorySettings::UpdateCommonBrands, which
  # mirrors a write to one side onto the other. Categories seeded from the
  # same brand group (chain/cassette/chainring/bottom_bracket) are NOT paired
  # here -- that was just a shared starting point, not a standing invariant.
  # Bidirectional so lookup is the same either direction; a custom category
  # is simply never a key.
  BRAND_LIST_PAIRS = {
    "tire_front" => "tire_rear", "tire_rear" => "tire_front",
    "wheel_front" => "wheel_rear", "wheel_rear" => "wheel_front",
    "brake_pads_front" => "brake_pads_rear", "brake_pads_rear" => "brake_pads_front",
  }.freeze

  validates :category, presence: true, uniqueness: { scope: :user_id }
  validates :default_ride_context, inclusion: { in: %w[both outdoor_only indoor_only] }
  validates :warning_threshold_percent, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 },
    allow_nil: true

  def self.brand_list_partner(category)
    BRAND_LIST_PAIRS[category]
  end

  # Like BikeType#default_categories=, entries aren't validated against a
  # server-side list -- brands are free text the user can add to directly
  # on the Settings page, or via a component save (see
  # ComponentCategorySettings::AddCommonBrand). Strip blanks, dedupe
  # case-insensitively (Array#uniq with a block keeps the first match, so
  # "Shimano" then "shimano" keeps "Shimano").
  def common_brands=(value)
    cleaned = Array(value).map(&:to_s).map(&:strip).reject(&:blank?)
    super(cleaned.uniq { |brand| brand.downcase })
  end

  def brand_list_partner
    self.class.brand_list_partner(category)
  end
end
