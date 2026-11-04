class AddAcquiredOnToBikes < ActiveRecord::Migration[7.1]
  def change
    add_column :bikes, :acquired_on, :date
  end
end
