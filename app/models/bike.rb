class Bike < ApplicationRecord
  has_many :component_assignments, dependent: :destroy
  has_many :components, through: :component_assignments

  validates :name, presence: true
end
