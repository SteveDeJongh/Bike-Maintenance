class BackfillServiceRequirementsData < ActiveRecord::Migration[7.1]
  # For each existing template/component row: name it after its old
  # service_type (collision-free -- ServiceType#name is already unique per
  # user, and a template's old service_type_id was already unique per
  # (user, category)), map time_interval_days -> calendar_amount/"day", and
  # give it one satisfier (that service_type, every allowance nil) --
  # except a *linked* component row, which never gets its own satisfier (it
  # uses its template's, same as the final model's own rule) and whose
  # name/ride_filter stay nil (inherit).
  def up
    CategoryServiceRequirement.reset_column_information
    ComponentServiceRequirement.reset_column_information

    CategoryServiceRequirement.find_each do |requirement|
      service_type = ServiceType.find(requirement.service_type_id)
      requirement.update_columns(
        name: service_type.name,
        calendar_amount: requirement.time_interval_days,
        calendar_unit: requirement.time_interval_days.present? ? "day" : nil,
      )
      ServiceRequirementSatisfier.create!(owner: requirement, service_type_id: requirement.service_type_id, position: 1)
    end

    ComponentServiceRequirement.find_each do |requirement|
      linked = requirement.category_service_requirement_id.present?

      requirement.update_columns(
        name: linked ? nil : ServiceType.find(requirement.service_type_id).name,
        calendar_amount: requirement.time_interval_days,
        calendar_unit: requirement.time_interval_days.present? ? "day" : nil,
      )
      next if linked

      ServiceRequirementSatisfier.create!(owner: requirement, service_type_id: requirement.service_type_id, position: 1)
    end
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
