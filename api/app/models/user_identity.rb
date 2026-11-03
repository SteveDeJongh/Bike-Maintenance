class UserIdentity < ApplicationRecord
  # "apple" isn't wired up yet (needs a paid developer account), but the
  # schema/model already accommodate it -- adding it later is just the gem
  # + a button, no migration.
  PROVIDERS = %w[google strava apple].freeze

  belongs_to :user

  validates :provider, inclusion: { in: PROVIDERS }
  validates :uid, presence: true, uniqueness: { scope: :provider }
  validates :user_id, uniqueness: { scope: :provider }
end
