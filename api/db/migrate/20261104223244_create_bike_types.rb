class CreateBikeTypes < ActiveRecord::Migration[7.1]
  def change
    create_table :bike_types do |t|
      t.references :user, null: false, foreign_key: true
      t.string :name, null: false
      t.string :default_categories, array: true, null: false, default: []

      t.timestamps
    end

    add_index :bike_types, "user_id, lower(name)", unique: true,
      name: "index_bike_types_on_user_id_and_lower_name"

    add_reference :bikes, :bike_type, foreign_key: true
  end
end
