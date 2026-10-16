class CreateTableViewPreferences < ActiveRecord::Migration[7.1]
  def change
    create_table :table_view_preferences do |t|
      t.references :user, null: false, foreign_key: true
      t.string :table_key, null: false
      t.jsonb :data, default: {}, null: false

      t.timestamps
    end
    add_index :table_view_preferences, [ :user_id, :table_key ], unique: true

    # Backfill: fold the old Bikes-only bike_list_preferences column into the
    # new generic shape (visible_columns -> columns; still no order concept
    # in the old data, so a user's columns may visibly reorder once after
    # this runs) rather than losing it.
    reversible do |dir|
      dir.up do
        execute <<~SQL
          INSERT INTO table_view_preferences (user_id, table_key, data, created_at, updated_at)
          SELECT id, 'bikes',
            jsonb_build_object(
              'columns', COALESCE(bike_list_preferences->'visible_columns', '[]'::jsonb),
              'sort_column', bike_list_preferences->'sort_column',
              'sort_direction', bike_list_preferences->'sort_direction'
            ),
            NOW(), NOW()
          FROM users
          WHERE bike_list_preferences != '{}'::jsonb
          ON CONFLICT (user_id, table_key) DO NOTHING
        SQL
      end
    end
  end
end
