class AddAuthFieldsToUsers < ActiveRecord::Migration[7.1]
  def up
    change_column_null :users, :email, true
    remove_index :users, :email
    add_index :users, "lower(email)", unique: true, where: "email IS NOT NULL", name: "index_users_on_lower_email"
    add_column :users, :email_verified_at, :datetime
    add_column :users, :password_digest, :string
  end

  def down
    remove_column :users, :password_digest
    remove_column :users, :email_verified_at
    remove_index :users, name: "index_users_on_lower_email"
    add_index :users, :email, unique: true
    change_column_null :users, :email, false
  end
end
