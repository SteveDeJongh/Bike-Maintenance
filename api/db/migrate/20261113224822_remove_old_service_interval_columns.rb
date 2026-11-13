class RemoveOldServiceIntervalColumns < ActiveRecord::Migration[7.1]
  def change
    remove_index :category_service_requirements, name: "index_csi_on_user_category_service_type"
    remove_index :component_service_requirements, name: "index_csi_on_component_and_service_type"

    remove_reference :category_service_requirements, :service_type, foreign_key: true
    remove_reference :component_service_requirements, :service_type, foreign_key: true

    remove_column :category_service_requirements, :time_interval_days, :integer
    remove_column :component_service_requirements, :time_interval_days, :integer

    change_column_null :category_service_requirements, :name, false
  end
end
