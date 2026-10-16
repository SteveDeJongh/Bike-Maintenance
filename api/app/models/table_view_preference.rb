class TableViewPreference < ApplicationRecord
  belongs_to :user

  validates :table_key, presence: true, uniqueness: { scope: :user_id }
  validate :data_is_a_hash

  private

  # Column keys and sort values are intentionally not enforced here, matching
  # how Component#category has no backend allow-list either — each
  # table_key's own frontend constant (e.g. BIKE_LIST_COLUMNS for "bikes") is
  # the sole source of truth for valid keys.
  def data_is_a_hash
    errors.add(:data, "must be a JSON object") unless data.is_a?(Hash)
  end
end
