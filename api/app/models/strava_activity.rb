class StravaActivity < ApplicationRecord
  belongs_to :user
  belongs_to :bike, optional: true

  validates :strava_id, presence: true, uniqueness: true
  validates :distance_meters, presence: true
  validates :moved_at, presence: true
  validate :not_ignored_while_attributed

  # Ride-level "don't track this" decision, same shape as
  # StravaGear#ignored_at/.ignored/.not_ignored -- but with no resurfacing
  # concept: a ride's own data never changes after sync the way a bike can
  # get new activities after being ignored, so there's no "later signal" to
  # resurface against.
  scope :ignored, -> { where.not(ignored_at: nil) }
  scope :not_ignored, -> { where(ignored_at: nil) }

  # "Indoor" covers both Strava's own trainer flag and Zwift/virtual rides
  # recorded as activity_type "VirtualRide" -- confirmed empirically that
  # Zwift's own Strava integration does not reliably set trainer: true on its
  # uploads, so activity_type is the trustworthy signal for virtual sessions,
  # not just descriptive metadata.
  scope :indoor, -> { where(trainer: true).or(where(activity_type: "VirtualRide")) }
  scope :outdoor, -> { where(trainer: false).where.not(activity_type: "VirtualRide") }

  # Instance-level mirror of the indoor scope above, for a single
  # already-loaded record (e.g. the dashboard's recent rides list) where a
  # second query just to classify one row would be wasteful.
  def indoor?
    trainer? || activity_type == "VirtualRide"
  end

  # One server-derived value so the frontend never re-implements the indoor
  # rule itself (see the Ride history table's Type column). virtual and
  # trainer together are exactly indoor? above -- virtual checked first,
  # since a virtual ride with trainer: true should still read "virtual,"
  # not "trainer."
  def ride_kind
    return "virtual" if activity_type == "VirtualRide"
    return "trainer" if trainer?

    "outdoor"
  end

  # Backfills bike_id onto activities synced before the user mapped this
  # bike's gear, or re-mapped it since. gear_id (Strava's raw identifier)
  # is stored separately from bike_id (the resolved local FK) specifically
  # so this reconciliation is possible after the fact. update_all bypasses
  # callbacks/validations, so ignored_at is cleared explicitly in the same
  # statement -- a ride is never both attributed and ignored, mirroring how
  # Bike#reconcile_strava_activities already clears StravaGear#ignored_at
  # as its own explicit statement right next to the gear-mapping update.
  def self.reconcile_for_bike!(bike)
    return if bike.strava_gear_id.blank?

    where(user_id: bike.user_id, gear_id: bike.strava_gear_id).update_all(bike_id: bike.id, ignored_at: nil)
  end

  # Unattributed, not ignored (itself or via its gear) -- the Dashboard
  # banner count and the Rides tab's "Needs attention" view both read from
  # this, so they can never disagree. ignored_gear_ids lets a caller that
  # also needs .ignored_for compute StravaGear.ignored_for(user) once and
  # pass it to both, rather than each scope querying it independently.
  def self.needs_attention_for(user, ignored_gear_ids: nil)
    ignored_gear_ids ||= StravaGear.ignored_for(user).pluck(:strava_gear_id)
    scope = user.strava_activities.where(bike_id: nil, ignored_at: nil)
    ignored_gear_ids.any? ? scope.where("gear_id IS NULL OR gear_id NOT IN (?)", ignored_gear_ids) : scope
  end

  # Unattributed, and either the ride itself is ignored or its gear is
  # ignored (and not resurfaced). Deliberately not "ignored" in the bare
  # scope sense above (which is purely "ignored_at is set") -- this is the
  # fuller "why does this ride not need attention" classification.
  def self.ignored_for(user, ignored_gear_ids: nil)
    ignored_gear_ids ||= StravaGear.ignored_for(user).pluck(:strava_gear_id)
    scope = user.strava_activities.where(bike_id: nil)
    ignored_gear_ids.any? ? scope.where("ignored_at IS NOT NULL OR gear_id IN (?)", ignored_gear_ids) : scope.where.not(ignored_at: nil)
  end

  # Per-row classification once a batch is already loaded (e.g. the Rides
  # tab's "all" view, which mixes attributed/needs-attention/ignored rows) --
  # takes the same ignored_gear_ids set so classifying a page of rides never
  # re-queries StravaGear per row.
  def attribution_status(ignored_gear_ids)
    return "attributed" if bike_id.present?
    return "ignored" if ignored_at.present? || ignored_gear_ids.include?(gear_id)

    "needs_attention"
  end

  # nil for an attributed ride. "ride" wins over "gear" when both apply.
  def reason(ignored_gear_ids)
    return nil if bike_id.present?
    return "ride" if ignored_at.present?
    return "gear" if ignored_gear_ids.include?(gear_id)

    gear_id.present? ? "unmapped_gear" : "no_gear"
  end

  private

  def not_ignored_while_attributed
    errors.add(:ignored_at, "cannot be set while this ride is attributed to a bike") if ignored_at.present? && bike_id.present?
  end
end
