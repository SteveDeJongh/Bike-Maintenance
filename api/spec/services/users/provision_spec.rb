require "rails_helper"

RSpec.describe Users::Provision, type: :model do
  # Pins Users::Provision to the exact end state past migrations produced
  # for existing users -- see 20261017004922_create_component_category_settings.rb
  # through 20261021233121_add_trackable_and_allows_multiple_to_component_category_settings.rb
  # (component_category_settings), and 20261026221651_replace_event_type_with_service_type_on_maintenance_events.rb's
  # fallback branch (service_types). User#after_create calls this for every
  # new user, so this spec exercises it indirectly via create(:user).
  it "seeds one component_category_setting per known category, with the migration-seeded defaults" do
    user = create(:user)

    settings = user.component_category_settings.index_by(&:category)
    expect(settings.keys).to match_array(%w[
      chain cassette chainring tire_front tire_rear wheel_front wheel_rear
      brake_pads_front brake_pads_rear bottom_bracket handlebar_tape saddle
      front_suspension shock frame seat_post power_meter pedals
    ])

    outdoor_only = %w[
      cassette tire_front tire_rear wheel_front wheel_rear brake_pads_front brake_pads_rear
      front_suspension shock
    ]
    settings.each do |category, setting|
      expect(setting.default_ride_context).to eq(outdoor_only.include?(category) ? "outdoor_only" : "both")
      expect(setting.allows_multiple_assignments).to eq(category == "cassette")
      expect(setting.trackable).to be true
    end
  end

  it "seeds common_brands per category, empty for frame and anything uncovered" do
    user = create(:user)
    settings = user.component_category_settings.index_by(&:category)

    expect(settings["chain"].common_brands).to include("Shimano", "SRAM")
    expect(settings["tire_front"].common_brands).to include("Maxxis", "Continental")
    expect(settings["saddle"].common_brands).to include("Fizik", "Brooks")
    expect(settings["frame"].common_brands).to eq([])
  end

  it "seeds the wax/clean/replace/inspect service types" do
    user = create(:user)

    expect(user.service_types.pluck(:name)).to match_array(%w[wax clean replace inspect])
  end

  it "seeds the Road/Gravel/Mountain/Time Trial/Commuter bike types with their default categories" do
    user = create(:user)

    bike_types = user.bike_types.index_by(&:name)
    expect(bike_types.keys).to match_array(["Road", "Gravel", "Mountain", "Time Trial", "Commuter"])
    expect(bike_types["Road"].default_categories).to eq(
      %w[chain cassette chainring tire_front tire_rear brake_pads_front brake_pads_rear handlebar_tape],
    )
    expect(bike_types["Mountain"].default_categories).to include("front_suspension", "shock", "seat_post")
  end

  it "is idempotent -- calling it again does not create duplicates or raise" do
    user = create(:user)

    expect { described_class.new(user).call }.not_to change(user.component_category_settings, :count)
    expect { described_class.new(user).call }.not_to change(user.service_types, :count)
    expect { described_class.new(user).call }.not_to change(user.bike_types, :count)
  end
end
