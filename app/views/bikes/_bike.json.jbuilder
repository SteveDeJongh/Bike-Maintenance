json.extract! bike, :id, :name, :make, :model, :strava_gear_id, :retired_on, :created_at, :updated_at
json.url bike_url(bike, format: :json)
