class AddCommonBrandsToComponentCategorySettings < ActiveRecord::Migration[7.1]
  # A frozen snapshot -- Users::Provision carries the live version these
  # values are mirrored from, same split already used for the category and
  # bike-type seeds.
  DRIVETRAIN = ["Shimano", "SRAM", "Campagnolo", "KMC", "Rotor", "FSA", "Praxis", "Race Face"].freeze
  TIRES = ["Continental", "Pirelli", "Schwalbe", "Michelin", "Vittoria", "Maxxis", "Panaracer"].freeze
  WHEELS = ["Zipp", "ENVE", "DT Swiss", "Mavic", "Hunt", "Roval"].freeze
  SUSPENSION_SEATPOSTS = ["Fox", "RockShox", "Öhlins", "SR Suntour", "Cane Creek", "BikeYoke", "OneUp", "PNW"].freeze
  POWER_PEDALS = ["Garmin", "Favero", "Quarq", "Stages", "4iiii", "Look", "Time", "Wahoo"].freeze
  BRAKE_PADS = ["SwissStop", "Kool-Stop"].freeze
  CONTACT_POINTS = ["Fizik", "Selle Italia", "Brooks", "Supacaz", "Lizard Skins", "ODI", "Ergon"].freeze

  SEED = {
    "chain" => DRIVETRAIN, "cassette" => DRIVETRAIN, "chainring" => DRIVETRAIN, "bottom_bracket" => DRIVETRAIN,
    "tire_front" => TIRES, "tire_rear" => TIRES,
    "wheel_front" => WHEELS, "wheel_rear" => WHEELS,
    "front_suspension" => SUSPENSION_SEATPOSTS, "shock" => SUSPENSION_SEATPOSTS, "seat_post" => SUSPENSION_SEATPOSTS,
    "power_meter" => POWER_PEDALS, "pedals" => POWER_PEDALS,
    "brake_pads_front" => BRAKE_PADS, "brake_pads_rear" => BRAKE_PADS,
    "saddle" => CONTACT_POINTS, "handlebar_tape" => CONTACT_POINTS,
    # frame: no entry -- frame brands are bike makes, not parts brands; a
    # custom category (not a key here at all) also just keeps the column's
    # [] default.
  }.freeze

  # A migration-local model, not the live app one -- isolates this one-time
  # seed from whatever validations/custom setters ComponentCategorySetting
  # grows later.
  class ComponentCategorySettingForMigration < ActiveRecord::Base
    self.table_name = "component_category_settings"
  end

  def up
    add_column :component_category_settings, :common_brands, :string, array: true, null: false, default: []

    # Unconditional, not find-or-create-style: the column is brand new, so
    # every existing row's value is still [] by construction -- there's no
    # "did the user already edit this" case to protect against yet, unlike
    # the category-key backfills.
    SEED.each do |category, brands|
      ComponentCategorySettingForMigration.where(category: category).update_all(common_brands: brands)
    end
  end

  def down
    remove_column :component_category_settings, :common_brands
  end
end
