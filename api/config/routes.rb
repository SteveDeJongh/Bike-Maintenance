Rails.application.routes.draw do
  resources :maintenance_events, except: %i[ new edit ]
  resources :component_assignments, except: %i[ new edit ]
  resources :components, except: %i[ new edit ]
  resources :bikes, except: %i[ new edit ]
  resources :bike_component_slots, only: %i[ create destroy ]

  get  "strava/authorize",     to: "strava#authorize"
  get  "strava/callback",      to: "strava#callback", as: :strava_callback
  post "strava/sync",          to: "strava#sync"
  get  "strava/status",        to: "strava#status"
  get  "strava/unmapped_gear", to: "strava#unmapped_gear"
  get   "strava/mapped_gear",       to: "strava#mapped_gear"
  patch "strava/mapped_gear/:gear_id", to: "strava#reassign_gear"
  post "strava/refresh_gear",  to: "strava#refresh_gear"

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check
end
