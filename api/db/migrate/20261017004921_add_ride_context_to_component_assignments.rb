class AddRideContextToComponentAssignments < ActiveRecord::Migration[7.1]
  def change
    add_column :component_assignments, :ride_context, :string, default: "both", null: false
  end
end
