module Components
  # Retiring a component as one action: ends every active assignment at
  # `at` (or, with a replacement, swaps it in at that instant through
  # ComponentAssignments::Swap), then sets retired_on to `at`'s local date
  # in the viewer's zone -- all in one transaction. ended_at keeps the exact
  # instant (it's what mileage attribution reads); retired_on is only the
  # calendar day.
  class Retire
    Result = Struct.new(:success?, :component, :ended_assignments, :new_assignment, :errors, keyword_init: true)

    def self.call(component:, at:, zone: Time.zone, replacement: nil)
      new(component, at, zone, replacement).call
    end

    def initialize(component, at, zone, replacement)
      @component = component
      @at = at
      @zone = zone
      @replacement = replacement
    end

    def call
      active = component.component_assignments.where(ended_at: nil).order(:id).to_a
      early_errors = validate_request(active)
      return failure(base: early_errors) if early_errors.any?

      new_assignment = nil
      errors = nil

      # Swap opens its own (nested, not requires_new) transaction, whose
      # ActiveRecord::Rollback only unwinds to the outermost block -- so on
      # any failure this raises Rollback itself, never leaving a half-done
      # swap committed.
      ActiveRecord::Base.transaction do
        if replacement
          swap = ComponentAssignments::Swap.call(assignment: active.first, component: replacement, swapped_at: at)
          unless swap.success?
            errors = swap.errors
            raise ActiveRecord::Rollback
          end
          new_assignment = swap.new_assignment
        else
          active.each do |assignment|
            next if assignment.update(ended_at: at)

            errors = assignment.errors
            raise ActiveRecord::Rollback
          end
        end

        unless component.update(retired_on: at.in_time_zone(zone).to_date)
          errors = component.errors
          raise ActiveRecord::Rollback
        end
      end

      if errors
        active.each(&:reload)
        component.reload
        return failure(errors)
      end

      Result.new(success?: true, component: component, ended_assignments: active, new_assignment: new_assignment)
    end

    private

    attr_reader :component, :at, :zone, :replacement

    def failure(errors)
      Result.new(success?: false, errors: errors)
    end

    # Same timing rules as ComponentAssignments::Swap (strictly after the
    # installation's start, no more than FUTURE_TOLERANCE ahead), so a plain
    # retire and a retire-and-replace never disagree about what's valid.
    def validate_request(active)
      errors = []
      errors << "#{component.label} is already retired." if component.retired_on.present?

      if at.blank?
        errors << "Retire date is required."
        return errors
      end

      errors << "Retire date can't be in the future." if at > Time.current + ComponentAssignments::Swap::FUTURE_TOLERANCE

      active.each do |assignment|
        next if at > assignment.started_at

        errors << "Retire date must be after its installation on #{assignment.bike.name} " \
          "(#{assignment.started_at.in_time_zone(zone).strftime('%B %-d, %Y at %-I:%M %p')})."
      end

      if active.empty?
        last_removed = component.component_assignments.maximum(:ended_at)
        if last_removed && at < last_removed
          errors << "Retire date can't be before it was last removed from a bike " \
            "(#{last_removed.in_time_zone(zone).strftime('%B %-d, %Y at %-I:%M %p')})."
        end
      end

      if replacement
        if active.empty?
          errors << "#{component.label} isn't on a bike, so there's nothing to replace."
        elsif active.many?
          errors << "#{component.label} is installed on more than one bike. Retire it without a " \
            "replacement, then install the new component on each bike."
        end
      end

      errors
    end
  end
end
