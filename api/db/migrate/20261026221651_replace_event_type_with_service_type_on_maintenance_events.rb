class ReplaceEventTypeWithServiceTypeOnMaintenanceEvents < ActiveRecord::Migration[7.1]
  def up
    add_reference :maintenance_events, :service_type, foreign_key: true

    # Create exactly the ServiceTypes implied by existing data -- one per
    # distinct event_type a user actually used (maintenance_events has no
    # direct user_id; join through component -> user). Seed the original 4
    # defaults only for a user with zero existing events, so no one gets
    # types invented for event_type values they never used.
    User.reset_column_information
    User.find_each do |user|
      used_types = MaintenanceEvent.joins(:component).where(components: { user_id: user.id }).distinct.pluck(:event_type)
      types = used_types.presence || %w[wax clean replace inspect]
      types.each { |name| ServiceType.find_or_create_by!(user: user, name: name) }
    end

    MaintenanceEvent.reset_column_information
    MaintenanceEvent.joins(component: :user).find_each do |event|
      service_type = ServiceType.find_by(user_id: event.component.user_id, name: event.event_type)
      event.update_column(:service_type_id, service_type.id)
    end

    change_column_null :maintenance_events, :service_type_id, false
    remove_column :maintenance_events, :event_type
  end

  def down
    add_column :maintenance_events, :event_type, :string
    MaintenanceEvent.reset_column_information
    MaintenanceEvent.includes(:service_type).find_each { |e| e.update_column(:event_type, e.service_type.name) }
    remove_reference :maintenance_events, :service_type
  end
end
