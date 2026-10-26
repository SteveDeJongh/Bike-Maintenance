class CreateServiceTypes < ActiveRecord::Migration[7.1]
  def change
    create_table :service_types do |t|
      t.references :user, null: false, foreign_key: true
      t.string :name, null: false

      t.timestamps
    end

    add_index :service_types, "user_id, lower(name)", unique: true,
      name: "index_service_types_on_user_id_and_lower_name"
  end
end
