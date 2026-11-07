class StravaActivity < ApplicationRecord
  belongs_to :user
  belongs_to :bike, optional: true

  validates :strava_id, presence: true, uniqueness: true
  validates :distance_meters, presence: true
  validates :moved_at, presence: true

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
  # so this reconciliation is possible after the fact.
  def self.reconcile_for_bike!(bike)
    return if bike.strava_gear_id.blank?

    where(user_id: bike.user_id, gear_id: bike.strava_gear_id).update_all(bike_id: bike.id)
  end
end
