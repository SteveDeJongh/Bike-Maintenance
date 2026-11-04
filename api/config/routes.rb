Rails.application.routes.draw do
  mount LetterOpenerWeb::Engine, at: "/letter_opener" if Rails.env.development?

  resources :service_types, except: %i[ new edit ]
  resources :maintenance_events, except: %i[ new edit ]
  resources :component_assignments, except: %i[ new edit ]
  resources :components, except: %i[ new edit ]
  resources :bikes, except: %i[ new edit ]
  resources :bike_component_slots, only: %i[ create destroy ]
  resources :table_view_preferences, param: :table_key, only: %i[ show update ]
  resources :component_category_settings, param: :category, only: %i[ index update ]
  resources :category_service_intervals, except: %i[ new edit ] do
    member { post :apply }
  end
  resources :component_service_intervals, except: %i[ new edit ] do
    collection { post :apply_defaults }
  end
  resources :service_alert_dismissals, only: %i[ create ] do
    collection { post :dismiss_all }
  end
  get   "dashboard",             to: "dashboard#index"
  get   "maintenance_alerts",    to: "maintenance_alerts#index"
  get   "notification_settings", to: "notification_settings#show"
  patch "notification_settings", to: "notification_settings#update"

  get    "me", to: "me#show"
  patch  "me", to: "me#update"
  delete "me", to: "me#destroy"

  delete "me/identities/:provider", to: "auth/identities#destroy"

  post   "auth/register", to: "auth/registrations#create"
  post   "auth/login",    to: "auth/sessions#create"
  delete "auth/logout",   to: "auth/sessions#destroy"
  get    "auth/csrf",     to: "auth/csrf#show"

  post "auth/password/forgot", to: "auth/passwords#forgot"
  post "auth/password/reset",  to: "auth/passwords#reset"
  put  "me/password",          to: "auth/passwords#update"

  post "auth/email/verify", to: "auth/email_verifications#verify"
  post "auth/email/resend", to: "auth/email_verifications#resend"

  get  "auth/strava",          to: "strava#authorize"
  get  "auth/strava/callback", to: "strava#callback", as: :strava_callback
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
