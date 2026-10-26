class CreateNotificationSettings < ActiveRecord::Migration[7.1]
  def change
    create_table :notification_settings do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.boolean :notifications_enabled, null: false, default: true
      t.integer :warning_threshold_percent, null: false, default: 5

      t.timestamps
    end
  end
end
