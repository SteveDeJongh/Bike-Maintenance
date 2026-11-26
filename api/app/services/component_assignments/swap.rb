module ComponentAssignments
  # The one-step chain-swap action: ends `assignment` at `swapped_at` and
  # installs `component` in its place -- same bike, same slot (category +
  # ride_context) -- starting at exactly that instant, in one transaction.
  # Exists because the app's main use case (two waxed chains rotating on
  # one bike) otherwise takes two separate actions (Remove, then Install)
  # whose timestamps land slightly apart, which is clumsy on a phone and
  # is exactly what Activity::Feed::MERGE_TOLERANCE exists to paper over.
  # Now that ComponentAssignment#overlaps? is half-open, an exact-boundary
  # swap is a real, valid assignment pair, not just a UI convenience.
  class Swap
    Result = Struct.new(:success?, :ended_assignment, :new_assignment, :errors, keyword_init: true)

    # The assignment's own clock-skew allowance (shared with ServiceSession's
    # order of magnitude) -- a small allowance, not a loose window.
    FUTURE_TOLERANCE = ComponentAssignment::FUTURE_TOLERANCE

    def self.call(assignment:, component:, swapped_at:)
      new(assignment, component, swapped_at).call
    end

    def initialize(assignment, component, swapped_at)
      @assignment = assignment
      @component = component
      @swapped_at = swapped_at
    end

    def call
      early_errors = validate_swap_request
      return Result.new(success?: false, errors: early_errors) if early_errors

      new_assignment = nil
      ended_successfully = false

      ActiveRecord::Base.transaction do
        ended_successfully = assignment.update(ended_at: swapped_at)
        raise ActiveRecord::Rollback unless ended_successfully

        new_assignment = ComponentAssignment.new(
          component_id: component.id,
          bike_id: assignment.bike_id,
          started_at: swapped_at,
          ended_at: nil,
          ride_context: assignment.ride_context,
        )
        raise ActiveRecord::Rollback unless new_assignment.save
      end

      if new_assignment.persisted?
        Result.new(success?: true, ended_assignment: assignment, new_assignment: new_assignment)
      elsif !ended_successfully
        Result.new(success?: false, errors: assignment.errors)
      else
        Result.new(success?: false, errors: new_assignment.errors)
      end
    end

    private

    attr_reader :assignment, :component, :swapped_at

    # Everything here is a precondition for even attempting the swap, not
    # something ComponentAssignment's own validations already express --
    # category/retired/self-swap are business rules specific to this
    # action, and swapped_at's own bounds are checked here for the same
    # reason ServiceSession checks performed_at itself rather than relying
    # on a generic model validation. Whether the new component is already
    # mounted in a conflicting way is deliberately NOT checked here --
    # that's exactly what ComponentAssignment's own overlap validations
    # are for, surfaced via new_assignment.errors when .save fails below.
    def validate_swap_request
      errors = []

      if component.category != assignment.component.category
        errors << "#{component.label} is a #{component.category}, not a #{assignment.component.category} -- " \
          "swap requires the same category."
      end

      errors << "#{component.label} is retired and can't be installed." if component.retired_on.present?

      errors << "Can't swap a component for itself." if component.id == assignment.component_id

      if swapped_at.blank?
        errors << "Swap date is required."
      else
        if swapped_at <= assignment.started_at
          errors << "Swap date must be after this installation's own start " \
            "(#{assignment.started_at.strftime('%B %-d, %Y at %-I:%M %p')})."
        end

        errors << "Swap date can't be in the future." if swapped_at > Time.current + FUTURE_TOLERANCE
      end

      errors.empty? ? nil : { base: errors }
    end
  end
end
