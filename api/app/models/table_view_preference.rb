class TableViewPreference < ApplicationRecord
  belongs_to :user

  validates :table_key, presence: true, uniqueness: { scope: :user_id }
  validate :data_is_a_hash
  validate :group_by_is_known

  # Each grouped list's allowed group_by values, per table_key. Absent means
  # that list's frontend default ("week" for the activity log, "category"
  # for the Components list). Other table keys don't group, so their
  # group_by isn't checked.
  GROUP_BY_VALUES = {
    "activity_log" => %w[week none],
    "components" => %w[category bike none],
  }.freeze

  private

  # The one data key validated here: group_by drives how a grouped list
  # renders at all, so a value the frontend can't handle is rejected rather
  # than stored.
  def group_by_is_known
    return unless data.is_a?(Hash) && data.key?("group_by")

    allowed = GROUP_BY_VALUES[table_key]
    return if allowed.nil? || allowed.include?(data["group_by"])

    errors.add(:data, "group_by must be one of: #{allowed.join(', ')}")
  end

  # Column keys and sort values are intentionally not enforced here, matching
  # how Component#category has no backend allow-list either — each
  # table_key's own frontend constant (e.g. BIKE_LIST_COLUMNS for "bikes") is
  # the sole source of truth for valid keys.
  def data_is_a_hash
    errors.add(:data, "must be a JSON object") unless data.is_a?(Hash)
  end
end
