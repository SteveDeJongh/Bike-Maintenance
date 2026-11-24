module Maintenance
  # Each component's most recent maintenance event, batched: one
  # DISTINCT ON query rather than one per component. For the Components
  # list, which shows a rotating spare as "<service type> · ready" when its
  # latest service came after its last removal (the frontend decides that
  # from these raw values and last_bike.removed_at).
  class LatestServiceQuery
    # Returns { component_id => { service_type_name:, performed_at: } } for
    # the user's components that have at least one event; ties on
    # performed_at prefer the later-created event.
    def self.call(user, component_ids: nil)
      scope = MaintenanceEvent.joins(:component, :service_type).where(components: { user_id: user.id })
      scope = scope.where(component_id: component_ids) if component_ids
      scope
        .select("DISTINCT ON (maintenance_events.component_id) maintenance_events.component_id, " \
                "maintenance_events.performed_at, service_types.name AS service_type_name")
        .order("maintenance_events.component_id, maintenance_events.performed_at DESC, maintenance_events.id DESC")
        .to_h { |row| [ row.component_id, { service_type_name: row.service_type_name, performed_at: row.performed_at } ] }
    end
  end
end
