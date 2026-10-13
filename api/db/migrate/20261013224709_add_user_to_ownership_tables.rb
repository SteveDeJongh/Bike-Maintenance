class AddUserToOwnershipTables < ActiveRecord::Migration[7.1]
  def up
    add_reference :bikes, :user, foreign_key: true
    add_reference :components, :user, foreign_key: true
    add_reference :strava_activities, :user, foreign_key: true

    # Placeholder identity, not the real owner's name/email — this is a
    # migration file, so it's committed to git. See CLAUDE.md for why.
    seed_user = User.find_or_create_by!(email: "owner@example.invalid") do |u|
      u.name = "Owner"
    end

    Bike.update_all(user_id: seed_user.id)
    Component.update_all(user_id: seed_user.id)
    StravaActivity.update_all(user_id: seed_user.id)

    change_column_null :bikes, :user_id, false
    change_column_null :components, :user_id, false
    change_column_null :strava_activities, :user_id, false
  end

  def down
    remove_reference :strava_activities, :user, foreign_key: true
    remove_reference :components, :user, foreign_key: true
    remove_reference :bikes, :user, foreign_key: true
  end
end
