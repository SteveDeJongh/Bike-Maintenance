class CreateServiceTypeCategories < ActiveRecord::Migration[7.1]
  def change
    create_table :service_type_categories do |t|
      t.references :service_type, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.string :category, null: false
      t.timestamps
    end

    add_index :service_type_categories, %i[service_type_id category], unique: true
  end
end
