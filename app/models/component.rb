class Component < ApplicationRecord
  has_many :component_assignments, dependent: :destroy
  has_many :bikes, through: :component_assignments
  has_many :maintenance_events, dependent: :destroy

  validates :label, presence: true
  validates :category, presence: true
end
