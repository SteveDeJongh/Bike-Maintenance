class BackfillDefaultBikeTypes < ActiveRecord::Migration[7.1]
  # A frozen snapshot, same convention as the component-category backfill
  # migrations -- Users::Provision::DEFAULT_BIKE_TYPES is the live version
  # new users get; this one never drifts if that changes later.
  DEFAULTS = {
    "Road" => %w[chain cassette chainring tire_front tire_rear brake_pads_front brake_pads_rear handlebar_tape],
    "Gravel" => %w[chain cassette chainring tire_front tire_rear brake_pads_front brake_pads_rear handlebar_tape],
    "Mountain" => %w[chain cassette chainring tire_front tire_rear brake_pads_front brake_pads_rear
                      handlebar_tape front_suspension shock seat_post],
    "Time Trial" => %w[chain cassette chainring tire_front tire_rear brake_pads_front brake_pads_rear],
    "Commuter" => %w[chain cassette tire_front tire_rear brake_pads_front brake_pads_rear],
  }.freeze

  def up
    User.find_each do |user|
      DEFAULTS.each do |name, categories|
        BikeType.find_or_create_by!(user: user, name: name) { |bt| bt.default_categories = categories }
      end
    end
  end
end
