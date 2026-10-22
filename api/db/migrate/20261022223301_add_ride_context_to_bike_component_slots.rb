class AddRideContextToBikeComponentSlots < ActiveRecord::Migration[7.1]
  def up
    add_column :bike_component_slots, :ride_context, :string, default: "both", null: false

    remove_index :bike_component_slots, name: "index_bike_component_slots_on_bike_id_and_category"
    add_index :bike_component_slots, [ :bike_id, :category, :ride_context ], unique: true,
      name: "index_bike_component_slots_on_bike_category_ride_context"

    # Split an existing slot into real, independent per-context slots
    # wherever it's actually being used that way already (only possible for
    # a category with allows_multiple_assignments -- every other category
    # was already capped at one active assignment by the pre-existing
    # overlap validation, so it has nothing to split and is left untouched).
    BikeComponentSlot.reset_column_information
    BikeComponentSlot.find_each do |slot|
      setting = ComponentCategorySetting.find_by(user_id: slot.bike.user_id, category: slot.category)
      next unless setting&.allows_multiple_assignments

      contexts = ComponentAssignment.joins(:component)
        .where(bike_id: slot.bike_id, components: { category: slot.category }, ended_at: nil)
        .distinct.pluck(:ride_context)
      restricted_contexts = contexts - [ "both" ]

      if restricted_contexts.size == 1
        slot.update!(ride_context: restricted_contexts.first)
      elsif restricted_contexts.size > 1
        slot.update!(ride_context: restricted_contexts.first)
        restricted_contexts.drop(1).each do |context|
          BikeComponentSlot.create!(bike_id: slot.bike_id, category: slot.category, ride_context: context)
        end
      end
    end
  end

  def down
    BikeComponentSlot.group(:bike_id, :category).having("count(*) > 1").count.each_key do |bike_id, category|
      BikeComponentSlot.where(bike_id: bike_id, category: category).order(:id).offset(1).destroy_all
    end

    remove_index :bike_component_slots, name: "index_bike_component_slots_on_bike_category_ride_context"
    add_index :bike_component_slots, [ :bike_id, :category ], unique: true,
      name: "index_bike_component_slots_on_bike_id_and_category"
    remove_column :bike_component_slots, :ride_context
  end
end
