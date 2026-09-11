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

ActiveRecord::Schema[7.1].define(version: 2026_09_11_004849) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "plpgsql"

  create_table "bikes", force: :cascade do |t|
    t.string "name"
    t.string "make"
    t.string "model"
    t.string "strava_gear_id"
    t.date "retired_on"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "component_assignments", force: :cascade do |t|
    t.bigint "component_id", null: false
    t.bigint "bike_id", null: false
    t.date "started_on"
    t.date "ended_on"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["bike_id"], name: "index_component_assignments_on_bike_id"
    t.index ["component_id"], name: "index_component_assignments_on_component_id"
  end

  create_table "components", force: :cascade do |t|
    t.string "label"
    t.string "category"
    t.date "acquired_on"
    t.date "retired_on"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "maintenance_events", force: :cascade do |t|
    t.bigint "component_id", null: false
    t.string "event_type"
    t.date "performed_on"
    t.text "notes"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["component_id"], name: "index_maintenance_events_on_component_id"
  end

  add_foreign_key "component_assignments", "bikes"
  add_foreign_key "component_assignments", "components"
  add_foreign_key "maintenance_events", "components"
end
