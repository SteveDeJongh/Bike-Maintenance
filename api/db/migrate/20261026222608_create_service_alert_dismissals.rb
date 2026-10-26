class CreateServiceAlertDismissals < ActiveRecord::Migration[7.1]
  def change
    create_table :service_alert_dismissals do |t|
      t.references :component_service_interval, null: false, foreign_key: true
      t.datetime :dismissed_at, null: false
      t.string :dismissed_status, null: false

      t.timestamps
    end
  end
end
