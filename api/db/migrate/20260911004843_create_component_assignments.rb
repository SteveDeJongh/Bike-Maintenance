class CreateComponentAssignments < ActiveRecord::Migration[7.1]
  def change
    create_table :component_assignments do |t|
      t.references :component, null: false, foreign_key: true
      t.references :bike, null: false, foreign_key: true
      t.date :started_on
      t.date :ended_on

      t.timestamps
    end
  end
end
