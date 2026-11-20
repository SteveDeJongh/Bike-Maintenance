# One category tag on a ServiceType. A type with no tags is universal; a
# tagged type is suggested first in pickers for its categories. Tags only
# ever filter pickers -- nothing validates an event, requirement, or
# satisfier against them.
#
# `category` is the same free-text string Component#category uses, with the
# same (presence-only) rules -- components don't normalise it, so neither
# does this. Categories can't be renamed today; if that's ever added, it must
# update these rows in the same transaction as component_category_settings.
class ServiceTypeCategory < ApplicationRecord
  belongs_to :service_type

  validates :category, presence: true, uniqueness: { scope: :service_type_id }
end
