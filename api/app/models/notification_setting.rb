class NotificationSetting < ApplicationRecord
  belongs_to :user

  validates :user_id, uniqueness: true
  validates :warning_threshold_percent, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 }

  # The one place "is this category's notifications on, and at what
  # threshold" gets resolved -- a category override
  # (ComponentCategorySetting#notifications_enabled/#warning_threshold_percent)
  # wins when set, else the user's global NotificationSetting, else the
  # hardcoded true/5% default if the user has no NotificationSetting row at
  # all yet (same missing-row-means-default convention used everywhere else
  # in this app).
  def self.effective_for(user:, category:)
    category_setting = ComponentCategorySetting.find_by(user_id: user.id, category: category)
    global = find_by(user_id: user.id)

    enabled = category_setting&.notifications_enabled
    enabled = global&.notifications_enabled if enabled.nil?
    enabled = true if enabled.nil?

    threshold = category_setting&.warning_threshold_percent
    threshold = global&.warning_threshold_percent if threshold.nil?
    threshold = 5 if threshold.nil?

    { enabled: enabled, warning_threshold_percent: threshold }
  end
end
