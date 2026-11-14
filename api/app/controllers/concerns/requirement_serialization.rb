# Shared by CategoryServiceRequirementsController and
# ComponentServiceRequirementsController -- one requirement JSON shape
# regardless of which model it's backed by. Satisfiers are always read from
# whichever row actually owns them (a linked ComponentServiceRequirement's
# satisfiers live on its template -- see #satisfier_owner), serialized RAW
# (nullable allowances, not resolved) since these are the editable CRUD
# endpoints -- a nil allowance is itself meaningful here ("inherits"), and
# the frontend already has the owning requirement's own thresholds in the
# same payload to render a "same as interval" placeholder against. A
# ComponentServiceRequirement additionally carries `effective` (already
# fully resolved, including inherited satisfier allowances) so a linked
# row's actual, in-effect values are available without a second request.
module RequirementSerialization
  private

  def serialize_requirement(requirement)
    owner = requirement.respond_to?(:satisfier_owner) ? requirement.satisfier_owner : requirement

    json = requirement.as_json(except: %w[ created_at updated_at ]).merge(
      "satisfiers" => owner.satisfiers.order(:position).map { |satisfier| serialize_satisfier(satisfier) },
    )
    json["effective"] = requirement.effective if requirement.respond_to?(:effective)
    json
  end

  def serialize_satisfier(satisfier)
    satisfier.as_json(only: %w[
      id service_type_id position
      allowance_distance_meters allowance_moving_time_seconds allowance_calendar_amount allowance_calendar_unit
    ]).merge("service_type_name" => satisfier.service_type.name)
  end
end
