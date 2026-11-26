class Component < ApplicationRecord
  # The built-in categories in display order -- a copy of the frontend's
  # COMPONENT_CATEGORIES (frontend/src/constants.ts); keep the two in sync.
  # Custom categories sort after these (category_sort_key).
  CATEGORY_ORDER = %w[
    chain cassette chainring bottom_bracket wheel_front wheel_rear tire_front tire_rear
    brake_pads_front brake_pads_rear saddle handlebar_tape pedals frame
    front_suspension rear_suspension seat_post power_meter
  ].freeze

  # [position, category]: built-ins in CATEGORY_ORDER, then custom ones A-Z.
  def self.category_sort_key(category)
    [ CATEGORY_ORDER.index(category) || CATEGORY_ORDER.size, category.to_s ]
  end

  belongs_to :user
  has_many :component_assignments, dependent: :destroy
  has_many :bikes, through: :component_assignments
  has_many :maintenance_events, dependent: :destroy
  has_many :component_service_requirements, dependent: :destroy

  validates :label, presence: true
  validates :category, presence: true

  # Effectively retired (docs/components-and-setup.md, "Installed, spare and
  # retired"): retired_on is set, or it has at least one open assignment and
  # every open assignment is on a retired bike -- retiring a bike leaves its
  # parts installed (it usually went with them), and they leave the
  # inventory with it. Derived, never stored: un-retiring the bike brings
  # them back. A spare (no open assignment) is unaffected; a shared cassette
  # still on any active bike stays. One definition: this scope, its inverse
  # and #effectively_retired? (parity-specced).
  OPEN_ON_RETIRED_BIKE_ONLY_SQL = <<~SQL.squish.freeze
    EXISTS (SELECT 1 FROM component_assignments ca WHERE ca.component_id = components.id AND ca.ended_at IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM component_assignments ca JOIN bikes b ON b.id = ca.bike_id
      WHERE ca.component_id = components.id AND ca.ended_at IS NULL AND b.retired_on IS NULL
    )
  SQL

  scope :effectively_retired, -> { where("components.retired_on IS NOT NULL OR (#{OPEN_ON_RETIRED_BIKE_ONLY_SQL})") }
  scope :in_inventory, -> { where.not(id: effectively_retired.select(:id)) }

  # The rule from a component's open bikes (current_bikes_by_component's
  # rows, each with the bike's retired_on) -- for batched lists.
  def self.effectively_retired_from?(retired_on, open_bikes)
    retired_on.present? || (open_bikes.any? && open_bikes.all? { |bike| bike[:retired_on].present? })
  end

  # The date the UI shows and sorts by: retired_on, else (when it's left on
  # retired bikes only) the latest of those bikes' retired_on.
  def self.effective_retired_on_from(retired_on, open_bikes)
    return retired_on if retired_on.present?
    return nil unless effectively_retired_from?(nil, open_bikes)

    open_bikes.map { |bike| bike[:retired_on] }.max
  end

  # Same convention as User#normalizes :email -- collapses whitespace
  # (including internal runs, not just leading/trailing) and turns a blank
  # value into nil, so "Shimano", "shimano ", and "Shimano  " don't drift
  # into different stored strings. Casing itself is left alone here; the
  # brand/model autocomplete suggests a canonical casing client-side instead
  # of this normalizing it away server-side. apply_to_nil stays at its
  # default (false), so a nil brand/model never reaches the lambda.
  normalizes :brand, :model, with: ->(value) { value.squish.presence }

  after_create :apply_category_service_requirements
  # Fires on create (brand/category go from nil -> set) and on any update
  # that changes brand or category while brand is (now) present -- a
  # retire/label-only edit touches neither, so no redundant write. Catches
  # every write path (ComponentsController, BikesController#component_setup)
  # at once -- see ComponentCategorySettings::AddCommonBrand for the
  # add-only, never-removes rule.
  after_save :remember_brand, if: -> { brand.present? && (saved_change_to_brand? || saved_change_to_category?) }

  # { component_id => [{id:, name:, ride_context:, started_at:}, ...] } for every currently-installed
  # (ended_at: nil) bike per component, batched for a many-row list (the
  # Components list's current_bikes column, the dashboard's off_bike/
  # attention bike lookups) -- a component can have more than one at once
  # (see ComponentAssignment's documented indoor_only-on-two-bikes
  # exception), so this is never assumed to be at most one.
  def self.current_bikes_by_component(user)
    ComponentAssignment.joins(:bike, :component)
      .where(ended_at: nil, components: { user_id: user.id })
      .pluck("component_assignments.component_id", "bikes.id", "bikes.name", "component_assignments.ride_context",
             "component_assignments.started_at", "bikes.retired_on")
      .each_with_object(Hash.new { |h, k| h[k] = [] }) do |(cid, bid, bname, ride_context, started_at, retired_on), h|
        h[cid] << { id: bid, name: bname, ride_context: ride_context, started_at: started_at, retired_on: retired_on }
      end
  end

  # The same rule per component, from its open assignments (preloaded
  # with their bikes when the caller has them, e.g.
  # Maintenance::RequirementStatus).
  def effectively_retired?
    self.class.effectively_retired_from?(retired_on, open_bikes_with_retirement)
  end

  def effective_retired_on
    self.class.effective_retired_on_from(retired_on, open_bikes_with_retirement)
  end

  UNDELETABLE_MESSAGE = "This component has installation or maintenance history, so it can't be deleted. Retire it instead.".freeze

  # Only a component with no history can be deleted (ComponentsController#
  # destroy): no assignment, ever, and no maintenance event.
  def deletable?
    !component_assignments.exists? && !maintenance_events.exists?
  end

  # Lifetime sums across all this component's assignment windows, on the
  # bike it was mounted to for each one. Windows are half-open —
  # [started_at, ended_at) — so a component swapped mid-day is credited
  # only the rides that happened while it was actually mounted, and an
  # activity falling on a swap boundary is never counted twice. The
  # windowing itself lives on ComponentAssignment (#activities_from) so
  # both the lifetime and per-installation-period views share one
  # implementation.
  def total_distance
    component_assignments.sum(&:distance_meters)
  end

  def total_moving_time
    component_assignments.sum(&:moving_time)
  end

  def total_elevation_gain
    component_assignments.sum(&:elevation_gain)
  end

  # nil (not 0) when the component has no device-metered activities across
  # any assignment. Can't just average each assignment's own average_power
  # (weighting bias) — pools the actual matching activity ids first, then
  # takes one real average over them.
  def average_power
    activity_ids = component_assignments.flat_map { |assignment| assignment.activities.pluck(:id) }
    StravaActivity.where(id: activity_ids, device_watts: true).average(:average_watts)&.round
  end

  # Same as total_distance, but only counting activity after the most
  # recent MaintenanceEvent of the given service type (or all of it, if
  # there is no such event yet).
  def distance_since(service_type:)
    last_event = maintenance_events.where(service_type: service_type).order(performed_at: :desc).first
    return total_distance if last_event.nil?

    component_assignments.sum do |assignment|
      range_start = [assignment.started_at, last_event.performed_at].max
      assignment.activities_from(range_start).sum(:distance_meters)
    end
  end

  private

  def open_bikes_with_retirement
    assignments = if component_assignments.loaded?
      component_assignments.select { |assignment| assignment.ended_at.nil? }
    else
      component_assignments.where(ended_at: nil).includes(:bike).to_a
    end
    assignments.map { |assignment| { retired_on: assignment.bike.retired_on } }
  end


  # Creating a component in a category auto-creates an enabled, linked
  # ComponentServiceRequirement for each of that category's templates --
  # adding a template later does NOT retroactively attach to existing
  # components (that's a deliberate, explicit "apply to" action instead,
  # since silently attaching to everything would be surprising). A linked
  # row has no satisfiers/name/thresholds of its own -- it inherits all of
  # that live from the template (see ComponentServiceRequirement#effective).
  def apply_category_service_requirements
    CategoryServiceRequirement.where(user_id: user_id, category: category).find_each do |template|
      component_service_requirements.create!(category_service_requirement: template)
    end
  end

  def remember_brand
    ComponentCategorySettings::AddCommonBrand.call(user: user, category: category, brand: brand)
  end
end
