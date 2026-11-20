class ServiceType < ApplicationRecord
  belongs_to :user
  has_many :maintenance_events, dependent: :restrict_with_error
  has_many :service_requirement_satisfiers, dependent: :restrict_with_error
  # Category tags. No tags = universal (applies to every category). Tags only
  # filter pickers ("filter, don't forbid") -- nothing rejects a type on an
  # untagged category. delete_all, with ON DELETE CASCADE behind it too.
  has_many :service_type_categories, dependent: :delete_all

  validates :name, presence: true, uniqueness: { scope: :user_id, case_sensitive: false }

  # Types a picker should suggest for `category`: tagged for it, or untagged.
  scope :applicable_to, ->(category) {
    where(id: ServiceTypeCategory.where(category: category).select(:service_type_id))
      .or(where.not(id: ServiceTypeCategory.select(:service_type_id)))
  }

  def categories
    service_type_categories.map(&:category).sort
  end

  def universal?
    service_type_categories.empty?
  end

  def applicable_to?(category)
    universal? || service_type_categories.any? { |tag| tag.category == category }
  end

  # Replaces the full tag set. [] makes the type universal. Strips blanks and
  # dedupes, same convention as BikeType#default_categories=.
  def replace_categories!(list)
    wanted = Array(list).map { |category| category.to_s.strip }.reject(&:blank?).uniq

    transaction do
      service_type_categories.where.not(category: wanted).delete_all
      existing = service_type_categories.reload.map(&:category)
      (wanted - existing).each { |category| service_type_categories.create!(category: category) }
    end
    service_type_categories.reset
  end

  # Automatic tagging (a satisfier added for `category`). Only adds a tag
  # when the type is tagged but not for this category -- a universal type is
  # already applicable everywhere, and tagging it would narrow it. Never
  # removes a tag.
  def tag_for!(category)
    return if category.blank? || applicable_to?(category)

    service_type_categories.create!(category: category)
    service_type_categories.reset
  end
end
