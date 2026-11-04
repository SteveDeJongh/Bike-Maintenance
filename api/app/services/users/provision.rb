module Users
  # Gives a user the same starting defaults past migrations seeded for
  # existing users -- called whenever a User is created, by any method (see
  # User#after_create). Idempotent: find_or_create_by/find_or_create_by!
  # throughout, safe to call more than once for the same user.
  class Provision
    # Mirrors 20261017004922_create_component_category_settings.rb through
    # 20261021233121_add_trackable_and_allows_multiple_to_component_category_settings.rb's
    # end state -- NOT the migrations' own intermediate column names. Plus
    # the six categories AddNewComponentCategorySettings backfilled for
    # existing users (front_suspension/shock/frame/seat_post/power_meter/pedals).
    OUTDOOR_ONLY_CATEGORIES = %w[
      cassette tire_front tire_rear wheel_front wheel_rear
      brake_pads_front brake_pads_rear front_suspension shock
    ].freeze

    BOTH_CATEGORIES = %w[
      chain chainring bottom_bracket handlebar_tape saddle
      frame seat_post power_meter pedals
    ].freeze

    ALLOWS_MULTIPLE_ASSIGNMENTS_CATEGORIES = %w[cassette].freeze

    # Mirrors 20261026221651_replace_event_type_with_service_type_on_maintenance_events.rb's
    # fallback branch (`types = used_types.presence || %w[wax clean replace inspect]`) --
    # a brand new user has no existing maintenance events, so this fallback
    # is always what applied historically.
    DEFAULT_SERVICE_TYPES = %w[wax clean replace inspect].freeze

    # The live version of BackfillDefaultBikeTypes's own frozen snapshot --
    # that migration never drifts if this changes later, same convention as
    # the component-category constants above.
    DEFAULT_BIKE_TYPES = {
      "Road" => %w[chain cassette chainring tire_front tire_rear brake_pads_front brake_pads_rear handlebar_tape],
      "Gravel" => %w[chain cassette chainring tire_front tire_rear brake_pads_front brake_pads_rear handlebar_tape],
      "Mountain" => %w[chain cassette chainring tire_front tire_rear brake_pads_front brake_pads_rear
                        handlebar_tape front_suspension shock seat_post],
      "Time Trial" => %w[chain cassette chainring tire_front tire_rear brake_pads_front brake_pads_rear],
      "Commuter" => %w[chain cassette tire_front tire_rear brake_pads_front brake_pads_rear],
    }.freeze

    def initialize(user)
      @user = user
    end

    def call
      provision_component_category_settings
      provision_service_types
      provision_bike_types
    end

    private

    attr_reader :user

    def provision_component_category_settings
      (OUTDOOR_ONLY_CATEGORIES + BOTH_CATEGORIES).each do |category|
        setting = ComponentCategorySetting.find_or_create_by!(user: user, category: category) do |s|
          s.default_ride_context = OUTDOOR_ONLY_CATEGORIES.include?(category) ? "outdoor_only" : "both"
          s.allows_multiple_assignments = ALLOWS_MULTIPLE_ASSIGNMENTS_CATEGORIES.include?(category)
        end
        setting
      end
    end

    def provision_service_types
      DEFAULT_SERVICE_TYPES.each do |name|
        ServiceType.find_or_create_by!(user: user, name: name)
      end
    end

    def provision_bike_types
      DEFAULT_BIKE_TYPES.each do |name, categories|
        BikeType.find_or_create_by!(user: user, name: name) do |bike_type|
          bike_type.default_categories = categories
        end
      end
    end
  end
end
