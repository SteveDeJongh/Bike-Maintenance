class User < ApplicationRecord
  normalizes :email, with: ->(email) { email.strip.downcase.presence }

  # Password is optional -- a user who only ever signs in with Google/Strava
  # has no password_digest. validations: false turns off has_secure_password's
  # own presence-on-create requirement; the length validation below only
  # kicks in when a password is actually being set.
  has_secure_password validations: false

  # Rails 7.1: the token embeds whatever the block returns at generation
  # time, and is rejected if that value has since changed -- password_salt
  # changes the moment the password does, so a reset token dies the instant
  # it's used (or the password is changed any other way) without needing to
  # store/revoke it ourselves. Same idea for email_verification, keyed off
  # the email itself: changing email invalidates any outstanding token.
  generates_token_for :password_reset, expires_in: 20.minutes do
    password_salt&.last(10)
  end

  generates_token_for :email_verification, expires_in: 1.day do
    email
  end

  has_many :bikes, dependent: :destroy
  has_many :bike_types, dependent: :destroy
  has_many :components, dependent: :destroy
  has_many :component_assignments, through: :bikes
  has_many :bike_component_slots, through: :bikes
  has_many :maintenance_events, through: :components
  has_many :strava_activities, dependent: :destroy
  has_many :strava_gears, dependent: :destroy
  has_one :strava_credential, dependent: :destroy
  has_many :table_view_preferences, dependent: :destroy
  has_many :component_category_settings, dependent: :destroy
  has_many :service_types, dependent: :destroy
  has_many :category_service_intervals, dependent: :destroy
  has_many :component_service_intervals, through: :components
  has_one :notification_setting, dependent: :destroy
  has_many :user_identities, dependent: :destroy

  validates :name, presence: true
  validates :email, uniqueness: true, allow_nil: true
  validates :password, length: { minimum: 8 }, allow_blank: true

  after_create :provision_defaults!

  def has_password?
    password_digest.present?
  end

  private

  def provision_defaults!
    Users::Provision.new(self).call
  end
end
