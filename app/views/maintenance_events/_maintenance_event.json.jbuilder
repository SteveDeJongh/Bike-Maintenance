json.extract! maintenance_event, :id, :component_id, :event_type, :performed_on, :notes, :created_at, :updated_at
json.url maintenance_event_url(maintenance_event, format: :json)
