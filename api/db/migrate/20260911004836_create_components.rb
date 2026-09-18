class CreateComponents < ActiveRecord::Migration[7.1]
  def change
    create_table :components do |t|
      t.string :label
      t.string :category
      t.date :acquired_on
      t.date :retired_on

      t.timestamps
    end
  end
end
