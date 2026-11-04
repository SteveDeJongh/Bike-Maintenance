class BikeType < ApplicationRecord
  belongs_to :user
  # Nothing is calculated from a bike type -- it only pre-checks the setup
  # checklist -- so deleting one in use clears it from those bikes instead
  # of blocking the delete (unlike ServiceType's restrict_with_error).
  has_many :bikes, dependent: :nullify

  validates :name, presence: true, uniqueness: { scope: :user_id, case_sensitive: false }

  # Like Component#category, entries aren't validated against a
  # server-side list -- allowed values come from the frontend (baseline
  # categories plus the user's custom ones). Strip blanks, dedupe.
  def default_categories=(value)
    super(Array(value).map(&:to_s).map(&:strip).reject(&:blank?).uniq)
  end
end
