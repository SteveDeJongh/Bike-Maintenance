class AddServiceSessionToMaintenanceEvents < ActiveRecord::Migration[7.1]
  def change
    add_reference :maintenance_events, :service_session, foreign_key: true
  end
end
