class ServiceSession < ApplicationRecord
  belongs_to :user
  belongs_to :bike
  has_many :maintenance_events, dependent: :destroy

  # Clock-skew allowance, same order of magnitude as
  # StravaCredential::REFRESH_BUFFER.
  FUTURE_TOLERANCE = 5.minutes

  validates :performed_at, presence: true
  validate :bike_belongs_to_user
  validate :performed_at_not_in_future

  # Keeps every event's date equal to the session's -- the counterpart to
  # MaintenanceEvent's own validation blocking a *direct* edit on a
  # session-bound event. update_all bypasses that validation (and callbacks,
  # which nothing here needs) deliberately, the same bypass-with-a-reason
  # pattern as StravaActivity.reconcile_for_bike!'s update_all.
  after_update :sync_event_performed_at, if: :saved_change_to_performed_at?

  private

  def bike_belongs_to_user
    return if bike.blank? || user.blank?

    errors.add(:base, "Bike must belong to the same user") if bike.user_id != user_id
  end

  def performed_at_not_in_future
    return if performed_at.blank?

    errors.add(:performed_at, "can't be in the future") if performed_at > Time.current + FUTURE_TOLERANCE
  end

  def sync_event_performed_at
    maintenance_events.update_all(performed_at: performed_at, updated_at: Time.current)
  end
end
