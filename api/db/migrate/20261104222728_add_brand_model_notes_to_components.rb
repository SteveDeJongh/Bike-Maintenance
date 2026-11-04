class AddBrandModelNotesToComponents < ActiveRecord::Migration[7.1]
  def change
    add_column :components, :brand, :string
    add_column :components, :model, :string
    add_column :components, :notes, :text
  end
end
