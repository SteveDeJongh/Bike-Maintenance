class CategoryServiceRequirement < ApplicationRecord
  CALENDAR_UNITS = %w[ day month year ].freeze
  RIDE_FILTERS = %w[ all outdoor indoor ].freeze

  belongs_to :user
  # delete_all, not destroy -- a satisfier's own before_destroy guard blocks
  # removing the LAST satisfier, which must not also block this whole
  # template (and its one satisfier) from being destroyed together.
  has_many :satisfiers, as: :owner, class_name: "ServiceRequirementSatisfier", dependent: :delete_all
  has_many :component_service_requirements, dependent: :destroy

  validates :category, presence: true
  validates :name, presence: true, uniqueness: { scope: [ :user_id, :category ], case_sensitive: false }
  validates :ride_filter, inclusion: { in: RIDE_FILTERS }
  validates :calendar_unit, inclusion: { in: CALENDAR_UNITS }, allow_nil: true
  validate :at_least_one_threshold_set
  validate :calendar_amount_and_unit_together

  def ordered_satisfiers
    satisfiers.order(:position)
  end

  private

  def at_least_one_threshold_set
    return if distance_meters.present? || moving_time_seconds.present? || calendar_amount.present?

    errors.add(:base, "Must set a distance, moving time, or calendar threshold")
  end

  def calendar_amount_and_unit_together
    return if calendar_amount.present? == calendar_unit.present?

    errors.add(:base, "Calendar amount and unit must be set together")
  end
end
