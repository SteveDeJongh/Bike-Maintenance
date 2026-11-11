class MaintenanceEvent < ApplicationRecord
  belongs_to :component
  belongs_to :service_type
  belongs_to :service_session, optional: true

  validates :performed_at, presence: true
  validate :component_and_service_type_have_same_owner
  # Scoped on: :update -- a new record's performed_at is set once, alongside
  # service_session_id, as part of the same batch create (ServiceSessionsController),
  # so that's never treated as an edit. Only changing an already-persisted,
  # session-bound event's date directly is rejected; the session's own
  # update_all cascade (ServiceSession#sync_event_performed_at) bypasses this
  # validation entirely, which is the one legitimate way the date moves.
  validate :performed_at_not_edited_while_in_session, on: :update

  after_destroy :destroy_now_empty_session

  private

  def component_and_service_type_have_same_owner
    return if component.blank? || service_type.blank?

    errors.add(:base, "Component and service type must belong to the same user") if component.user_id != service_type.user_id
  end

  def performed_at_not_edited_while_in_session
    return unless service_session_id.present? && will_save_change_to_performed_at?

    errors.add(:performed_at, "can't be changed directly while part of a service session — edit the session's date instead")
  end

  def destroy_now_empty_session
    return if service_session_id.nil?

    session = ServiceSession.find_by(id: service_session_id)
    session.destroy! if session && session.maintenance_events.none?
  end
end
