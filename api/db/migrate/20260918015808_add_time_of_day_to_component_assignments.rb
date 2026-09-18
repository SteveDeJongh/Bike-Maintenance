class AddTimeOfDayToComponentAssignments < ActiveRecord::Migration[7.1]
  def up
    change_column :component_assignments, :started_on, :datetime
    change_column :component_assignments, :ended_on, :datetime
  end

  def down
    change_column :component_assignments, :started_on, :date
    change_column :component_assignments, :ended_on, :date
  end
end
