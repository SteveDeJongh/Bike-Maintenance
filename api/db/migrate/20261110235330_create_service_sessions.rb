class CreateServiceSessions < ActiveRecord::Migration[7.1]
  def change
    create_table :service_sessions do |t|
      t.references :user, null: false, foreign_key: true
      t.references :bike, null: false, foreign_key: true
      t.datetime :performed_at, null: false
      t.text :notes

      t.timestamps
    end
  end
end
