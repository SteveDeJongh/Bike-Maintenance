class TableViewPreference < ApplicationRecord
  belongs_to :user

  validates :table_key, presence: true, uniqueness: { scope: :user_id }
  validate :data_is_a_hash
  validate :group_by_is_known

  # The activity log's list grouping. Absent means "week" (the frontend's
  # default).
  GROUP_BY_VALUES = %w[week none].freeze

  private

  # The one data key validated here: group_by drives how the activity log
  # renders at all, so a value the frontend can't handle is rejected rather
  # than stored.
  def group_by_is_known
    return unless data.is_a?(Hash) && data.key?("group_by")

    errors.add(:data, "group_by must be one of: #{GROUP_BY_VALUES.join(', ')}") unless GROUP_BY_VALUES.include?(data["group_by"])
  end

  # Column keys and sort values are intentionally not enforced here, matching
  # how Component#category has no backend allow-list either — each
  # table_key's own frontend constant (e.g. BIKE_LIST_COLUMNS for "bikes") is
  # the sole source of truth for valid keys.
  def data_is_a_hash
    errors.add(:data, "must be a JSON object") unless data.is_a?(Hash)
  end
end
