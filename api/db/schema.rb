# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[7.1].define(version: 2026_11_11_005315) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "plpgsql"

  create_table "bike_component_slots", force: :cascade do |t|
    t.bigint "bike_id", null: false
    t.string "category", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "ride_context", default: "both", null: false
    t.index ["bike_id", "category", "ride_context"], name: "index_bike_component_slots_on_bike_category_ride_context", unique: true
    t.index ["bike_id"], name: "index_bike_component_slots_on_bike_id"
  end

  create_table "bike_types", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "name", null: false
    t.string "default_categories", default: [], null: false, array: true
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "user_id, lower((name)::text)", name: "index_bike_types_on_user_id_and_lower_name", unique: true
    t.index ["user_id"], name: "index_bike_types_on_user_id"
  end

  create_table "bikes", force: :cascade do |t|
    t.string "name"
    t.string "make"
    t.string "model"
    t.string "strava_gear_id"
    t.date "retired_on"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.date "acquired_on"
    t.bigint "bike_type_id"
    t.index ["bike_type_id"], name: "index_bikes_on_bike_type_id"
    t.index ["user_id"], name: "index_bikes_on_user_id"
  end

  create_table "category_service_intervals", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "category", null: false
    t.bigint "service_type_id", null: false
    t.integer "distance_interval_meters"
    t.integer "time_interval_days"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["service_type_id"], name: "index_category_service_intervals_on_service_type_id"
    t.index ["user_id", "category", "service_type_id"], name: "index_csi_on_user_category_service_type", unique: true
    t.index ["user_id"], name: "index_category_service_intervals_on_user_id"
  end

  create_table "component_assignments", force: :cascade do |t|
    t.bigint "component_id", null: false
    t.bigint "bike_id", null: false
    t.datetime "started_at"
    t.datetime "ended_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "ride_context", default: "both", null: false
    t.index ["bike_id", "ended_at"], name: "index_component_assignments_on_bike_ended", where: "(ended_at IS NOT NULL)"
    t.index ["bike_id", "started_at"], name: "index_component_assignments_on_bike_started"
    t.index ["bike_id"], name: "index_component_assignments_on_bike_id"
    t.index ["component_id"], name: "index_component_assignments_on_component_id"
  end

  create_table "component_category_settings", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "category", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "default_ride_context", default: "both", null: false
    t.boolean "trackable", default: true, null: false
    t.boolean "allows_multiple_assignments", default: false, null: false
    t.boolean "notifications_enabled"
    t.integer "warning_threshold_percent"
    t.string "common_brands", default: [], null: false, array: true
    t.index ["user_id", "category"], name: "index_component_category_settings_on_user_id_and_category", unique: true
    t.index ["user_id"], name: "index_component_category_settings_on_user_id"
  end

  create_table "component_service_intervals", force: :cascade do |t|
    t.bigint "component_id", null: false
    t.bigint "category_service_interval_id"
    t.bigint "service_type_id", null: false
    t.integer "distance_interval_meters"
    t.integer "time_interval_days"
    t.boolean "enabled", default: true, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["category_service_interval_id"], name: "idx_on_category_service_interval_id_d73a69d3de"
    t.index ["component_id", "service_type_id"], name: "index_csi_on_component_and_service_type", unique: true
    t.index ["component_id"], name: "index_component_service_intervals_on_component_id"
    t.index ["service_type_id"], name: "index_component_service_intervals_on_service_type_id"
  end

  create_table "components", force: :cascade do |t|
    t.string "label"
    t.string "category"
    t.date "acquired_on"
    t.date "retired_on"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.string "brand"
    t.string "model"
    t.text "notes"
    t.index ["user_id"], name: "index_components_on_user_id"
  end

  create_table "maintenance_events", force: :cascade do |t|
    t.bigint "component_id", null: false
    t.datetime "performed_at"
    t.text "notes"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "service_type_id", null: false
    t.bigint "service_session_id"
    t.index ["component_id"], name: "index_maintenance_events_on_component_id"
    t.index ["performed_at", "id"], name: "index_maintenance_events_on_performed_id_sessionless", where: "(service_session_id IS NULL)"
    t.index ["service_session_id"], name: "index_maintenance_events_on_service_session_id"
    t.index ["service_type_id"], name: "index_maintenance_events_on_service_type_id"
  end

  create_table "notification_settings", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.boolean "notifications_enabled", default: true, null: false
    t.integer "warning_threshold_percent", default: 5, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_notification_settings_on_user_id", unique: true
  end

  create_table "service_alert_dismissals", force: :cascade do |t|
    t.bigint "component_service_interval_id", null: false
    t.datetime "dismissed_at", null: false
    t.string "dismissed_status", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["component_service_interval_id"], name: "idx_on_component_service_interval_id_29f0d01c93"
  end

  create_table "service_sessions", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "bike_id", null: false
    t.datetime "performed_at", null: false
    t.text "notes"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["bike_id"], name: "index_service_sessions_on_bike_id"
    t.index ["user_id", "performed_at", "id"], name: "index_service_sessions_on_user_performed_id"
    t.index ["user_id"], name: "index_service_sessions_on_user_id"
  end

  create_table "service_types", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "name", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "user_id, lower((name)::text)", name: "index_service_types_on_user_id_and_lower_name", unique: true
    t.index ["user_id"], name: "index_service_types_on_user_id"
  end

  create_table "strava_activities", force: :cascade do |t|
    t.bigint "strava_id", null: false
    t.bigint "bike_id"
    t.integer "distance_meters", default: 0, null: false
    t.datetime "moved_at", null: false
    t.string "name"
    t.string "activity_type"
    t.datetime "synced_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.string "gear_id"
    t.boolean "trainer", default: false, null: false
    t.boolean "commute", default: false, null: false
    t.integer "moving_time"
    t.integer "elapsed_time"
    t.float "average_speed"
    t.float "max_speed"
    t.float "total_elevation_gain"
    t.float "average_watts"
    t.integer "weighted_average_watts"
    t.boolean "device_watts"
    t.float "kilojoules"
    t.float "average_heartrate"
    t.float "max_heartrate"
    t.float "average_cadence"
    t.datetime "ignored_at"
    t.index ["bike_id", "moved_at", "id"], name: "index_strava_activities_on_bike_moved_id"
    t.index ["bike_id"], name: "index_strava_activities_on_bike_id"
    t.index ["strava_id"], name: "index_strava_activities_on_strava_id", unique: true
    t.index ["user_id", "moved_at", "id"], name: "index_strava_activities_on_user_moved_id"
    t.index ["user_id"], name: "index_strava_activities_on_user_id"
  end

  create_table "strava_credentials", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "access_token", null: false
    t.string "refresh_token", null: false
    t.bigint "athlete_id", null: false
    t.datetime "expires_at", null: false
    t.string "scope"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.datetime "last_synced_at"
    t.datetime "last_full_sync_at"
    t.datetime "full_sync_started_at"
    t.datetime "last_sync_failed_at"
    t.string "last_sync_error"
    t.string "last_sync_failed_kind"
    t.datetime "last_sync_retry_at"
    t.index ["athlete_id"], name: "index_strava_credentials_on_athlete_id", unique: true
    t.index ["user_id"], name: "index_strava_credentials_on_user_id", unique: true
  end

  create_table "strava_gears", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "strava_gear_id", null: false
    t.string "name"
    t.string "brand_name"
    t.string "model"
    t.boolean "retired", default: false, null: false
    t.integer "distance_meters"
    t.datetime "synced_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.datetime "ignored_at"
    t.index ["user_id", "strava_gear_id"], name: "index_strava_gears_on_user_id_and_strava_gear_id", unique: true
    t.index ["user_id"], name: "index_strava_gears_on_user_id"
  end

  create_table "table_view_preferences", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "table_key", null: false
    t.jsonb "data", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id", "table_key"], name: "index_table_view_preferences_on_user_id_and_table_key", unique: true
    t.index ["user_id"], name: "index_table_view_preferences_on_user_id"
  end

  create_table "user_identities", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "provider", null: false
    t.string "uid", null: false
    t.string "email"
    t.boolean "email_verified", default: false, null: false
    t.datetime "last_used_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["provider", "uid"], name: "index_user_identities_on_provider_and_uid", unique: true
    t.index ["user_id", "provider"], name: "index_user_identities_on_user_id_and_provider", unique: true
    t.index ["user_id"], name: "index_user_identities_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "name", null: false
    t.string "email"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.datetime "email_verified_at"
    t.string "password_digest"
    t.index "lower((email)::text)", name: "index_users_on_lower_email", unique: true, where: "(email IS NOT NULL)"
  end

  add_foreign_key "bike_component_slots", "bikes"
  add_foreign_key "bike_types", "users"
  add_foreign_key "bikes", "bike_types"
  add_foreign_key "bikes", "users"
  add_foreign_key "category_service_intervals", "service_types"
  add_foreign_key "category_service_intervals", "users"
  add_foreign_key "component_assignments", "bikes"
  add_foreign_key "component_assignments", "components"
  add_foreign_key "component_category_settings", "users"
  add_foreign_key "component_service_intervals", "category_service_intervals"
  add_foreign_key "component_service_intervals", "components"
  add_foreign_key "component_service_intervals", "service_types"
  add_foreign_key "components", "users"
  add_foreign_key "maintenance_events", "components"
  add_foreign_key "maintenance_events", "service_sessions"
  add_foreign_key "maintenance_events", "service_types"
  add_foreign_key "notification_settings", "users"
  add_foreign_key "service_alert_dismissals", "component_service_intervals"
  add_foreign_key "service_sessions", "bikes"
  add_foreign_key "service_sessions", "users"
  add_foreign_key "service_types", "users"
  add_foreign_key "strava_activities", "bikes"
  add_foreign_key "strava_activities", "users"
  add_foreign_key "strava_credentials", "users"
  add_foreign_key "strava_gears", "users"
  add_foreign_key "table_view_preferences", "users"
  add_foreign_key "user_identities", "users"
end
