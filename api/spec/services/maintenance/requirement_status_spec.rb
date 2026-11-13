require "rails_helper"

RSpec.describe Maintenance::RequirementStatus do
  def build_component(category: "chain", acquired_on: Date.new(2026, 1, 1))
    bike = create(:bike)
    component = create(:component, user: bike.user, category: category, acquired_on: acquired_on)
    create(:component_assignment, component: component, bike: bike, started_at: acquired_on.to_time(:utc), ended_at: nil)
    [ component, bike ]
  end

  def status_for(requirement)
    described_class.for_component(requirement.component).find { |r| r.component_service_requirement.id == requirement.id }
  end

  describe "chain lube: multiple satisfiers with different allowances" do
    # 500km threshold, satisfied by hot wax (inherits the full 500km) or
    # drip wax (an explicit, smaller 250km allowance) -- the worked example
    # from the feature spec, verbatim.
    def setup_chain_lube
      component, bike = build_component
      hot_wax = create(:service_type, user: component.user, name: "Hot Wax")
      drip_wax = create(:service_type, user: component.user, name: "Drip Wax")
      requirement = create(:component_service_requirement, component: component, name: "Chain lube",
        distance_meters: 500_000, service_type: hot_wax)
      create(:service_requirement_satisfier, owner: requirement, service_type: drip_wax, position: 2,
        allowance_distance_meters: 250_000)
      [ requirement, bike, hot_wax, drip_wax ]
    end

    it "hot wax at 0km is due at 500km" do
      requirement, bike, hot_wax, = setup_chain_lube
      create(:maintenance_event, component: requirement.component, service_type: hot_wax,
        performed_at: Time.zone.local(2026, 1, 1, 9, 0))
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), distance_meters: 500_000)

      result = status_for(requirement)

      expect(result.status).to eq("due")
      expect(result.distance_remaining_meters).to eq(0)
    end

    it "hot wax at 0, then drip wax at 500km, is due at 750km" do
      requirement, bike, hot_wax, drip_wax = setup_chain_lube
      create(:maintenance_event, component: requirement.component, service_type: hot_wax,
        performed_at: Time.zone.local(2026, 1, 1, 9, 0))
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), distance_meters: 500_000)
      create(:maintenance_event, component: requirement.component, service_type: drip_wax,
        performed_at: Time.zone.local(2026, 2, 1, 9, 0))
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 3, 1), distance_meters: 250_000)

      result = status_for(requirement)

      expect(result.distance_used_meters).to eq(250_000) # 750_000 (now) - 500_000 (setting position)
      expect(result.distance_remaining_meters).to eq(0) # due exactly at 750km
      expect(result.status).to eq("due")
    end

    it "hot wax at 0, drip wax at 500, hot wax again at 750, is due at 1250km" do
      requirement, bike, hot_wax, drip_wax = setup_chain_lube
      create(:maintenance_event, component: requirement.component, service_type: hot_wax,
        performed_at: Time.zone.local(2026, 1, 1, 9, 0))
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), distance_meters: 500_000)
      create(:maintenance_event, component: requirement.component, service_type: drip_wax,
        performed_at: Time.zone.local(2026, 2, 1, 9, 0))
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 3, 1), distance_meters: 250_000)
      create(:maintenance_event, component: requirement.component, service_type: hot_wax,
        performed_at: Time.zone.local(2026, 3, 1, 9, 0))
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 4, 1), distance_meters: 500_000)

      result = status_for(requirement)

      expect(result.distance_used_meters).to eq(500_000) # 1_250_000 (now) - 750_000 (setting position)
      expect(result.distance_remaining_meters).to eq(0)
    end

    it "hot wax at 0, drip wax at 300 only -- due at 550km, pushed forward past the first event's own due point" do
      requirement, bike, hot_wax, drip_wax = setup_chain_lube
      create(:maintenance_event, component: requirement.component, service_type: hot_wax,
        performed_at: Time.zone.local(2026, 1, 1, 9, 0))
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), distance_meters: 300_000)
      create(:maintenance_event, component: requirement.component, service_type: drip_wax,
        performed_at: Time.zone.local(2026, 2, 1, 9, 0))
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 10), distance_meters: 250_000)

      result = status_for(requirement)

      # due = 550km, current position = 550km -- exactly due, not ok.
      expect(result.distance_remaining_meters).to eq(0)
      expect(result.status).to eq("due")
    end

    it "hot wax at 0, drip wax at 100 only -- an early, shorter service never pulls the due point earlier" do
      requirement, bike, hot_wax, drip_wax = setup_chain_lube
      create(:maintenance_event, component: requirement.component, service_type: hot_wax,
        performed_at: Time.zone.local(2026, 1, 1, 9, 0))
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 15), distance_meters: 100_000)
      create(:maintenance_event, component: requirement.component, service_type: drip_wax,
        performed_at: Time.zone.local(2026, 1, 15, 9, 0))
      # Current position stays at 300km (the drip wax, worth only
      # 100+250=350km due, is dominated by the hot wax's own 0+500=500km due).
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), distance_meters: 200_000)

      result = status_for(requirement)

      # Due is still 500km (from the hot wax), NOT 350km (from the drip wax) --
      # the whole point of the max-based formula.
      expect(result.distance_remaining_meters).to eq(200_000)
      expect(result.status).to eq("ok")
      expect(result.setting_event.service_type).to eq(hot_wax)
    end
  end

  describe "chain re-wax: single satisfier, outdoor-only ride filter" do
    it "a drip wax event never affects a requirement it does not satisfy, and trainer km never count toward an outdoor-only requirement" do
      component, bike = build_component
      hot_wax = create(:service_type, user: component.user, name: "Hot Wax")
      drip_wax = create(:service_type, user: component.user, name: "Drip Wax")
      rewax = create(:component_service_requirement, component: component, name: "Chain re-wax",
        distance_meters: 1_500_000, ride_filter: "outdoor", service_type: hot_wax)

      create(:maintenance_event, component: component, service_type: hot_wax, performed_at: Time.zone.local(2026, 1, 1, 9, 0))
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), distance_meters: 500_000, trainer: false)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 15), distance_meters: 10_000_000, trainer: true)
      create(:maintenance_event, component: component, service_type: drip_wax, performed_at: Time.zone.local(2026, 2, 20, 9, 0))

      result = status_for(rewax)

      expect(result.distance_used_meters).to eq(500_000)
      expect(result.distance_remaining_meters).to eq(1_000_000)
      expect(result.setting_event.service_type).to eq(hot_wax)
    end
  end

  describe "fork 50h / fork 200h: a bigger service clears a smaller one, never the reverse" do
    def setup_fork_pair
      component, bike = build_component(category: "front_suspension")
      fifty = create(:service_type, user: component.user, name: "50h Service")
      two_hundred = create(:service_type, user: component.user, name: "200h Service")

      fork50 = create(:component_service_requirement, component: component, name: "Fork 50h",
        moving_time_seconds: 50.hours.to_i, distance_interval_meters: nil, service_type: fifty)
      create(:service_requirement_satisfier, owner: fork50, service_type: two_hundred, position: 2)

      fork200 = create(:component_service_requirement, component: component, name: "Fork 200h",
        moving_time_seconds: 200.hours.to_i, distance_interval_meters: nil, service_type: two_hundred)

      [ fork50, fork200, bike, fifty, two_hundred ]
    end

    it "a 200h service at t=200h clears both requirements forward by their own thresholds" do
      fork50, fork200, bike, _fifty, two_hundred = setup_fork_pair
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), moving_time: 200.hours.to_i, distance_meters: 1)
      create(:maintenance_event, component: fork50.component, service_type: two_hundred,
        performed_at: Time.zone.local(2026, 2, 2))

      fork50_result = status_for(fork50)
      fork200_result = status_for(fork200)

      expect(fork50_result.moving_time_remaining_seconds).to eq(50.hours.to_i)
      expect(fork200_result.moving_time_remaining_seconds).to eq(200.hours.to_i)
    end

    it "a 50h service at t=205h clears only the 50h requirement, leaving the 200h one untouched" do
      fork50, fork200, bike, fifty, = setup_fork_pair
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), moving_time: 205.hours.to_i, distance_meters: 1)
      create(:maintenance_event, component: fork50.component, service_type: fifty,
        performed_at: Time.zone.local(2026, 2, 2))

      fork50_result = status_for(fork50)
      fork200_result = status_for(fork200)

      expect(fork50_result.moving_time_remaining_seconds).to eq(50.hours.to_i)
      # fork200 never had a matching event -- still driven by its own synthetic
      # fallback (baseline at 0h, due at 200h), already overdue.
      expect(fork200_result.moving_time_remaining_seconds).to be < 0
      expect(fork200_result.setting_event).to be_nil
    end
  end

  describe "ride filter narrows an unrestricted ride_context, but can never widen a restricted one" do
    it "a ride_filter of outdoor excludes trainer km even though the assignment itself is ride_context both" do
      component, bike = build_component(category: "cassette")
      wax = create(:service_type, user: component.user, name: "Lube")
      all_requirement = create(:component_service_requirement, component: component, name: "Cassette clean (all)",
        distance_meters: 1_000_000, ride_filter: "all", service_type: wax)
      outdoor_requirement = create(:component_service_requirement, component: component, name: "Cassette clean (outdoor)",
        distance_meters: 1_000_000, ride_filter: "outdoor", service_type: wax)

      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), distance_meters: 100_000, trainer: false)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 2), distance_meters: 50_000, trainer: true)

      expect(status_for(all_requirement).distance_used_meters).to eq(150_000)
      expect(status_for(outdoor_requirement).distance_used_meters).to eq(100_000)
    end

    it "an indoor_only assignment contributes zero to an outdoor ride_filter requirement -- ride_context excludes it before ride_filter is even applied" do
      user = create(:user)
      bike = create(:bike, user: user)
      ComponentCategorySetting.find_or_initialize_by(user: user, category: "cassette").update!(allows_multiple_assignments: true)
      create(:bike_component_slot, bike: bike, category: "cassette", ride_context: "outdoor_only")
      create(:bike_component_slot, bike: bike, category: "cassette", ride_context: "indoor_only")

      outdoor_cassette = create(:component, user: user, category: "cassette", acquired_on: Date.new(2026, 1, 1))
      indoor_cassette = create(:component, user: user, category: "cassette", acquired_on: Date.new(2026, 1, 1))
      create(:component_assignment, component: outdoor_cassette, bike: bike, ride_context: "outdoor_only",
        started_at: Time.zone.local(2026, 1, 1))
      create(:component_assignment, component: indoor_cassette, bike: bike, ride_context: "indoor_only",
        started_at: Time.zone.local(2026, 1, 1))

      wax = create(:service_type, user: user, name: "Lube")
      outdoor_slot_requirement = create(:component_service_requirement, component: outdoor_cassette,
        name: "Outdoor slot", distance_meters: 1_000_000, ride_filter: "outdoor", service_type: wax)
      indoor_slot_requirement = create(:component_service_requirement, component: indoor_cassette,
        name: "Indoor slot, outdoor filter", distance_meters: 1_000_000, ride_filter: "outdoor", service_type: wax)

      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), distance_meters: 100_000, trainer: false)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 2), distance_meters: 50_000, trainer: true)

      expect(status_for(outdoor_slot_requirement).distance_used_meters).to eq(100_000)
      expect(status_for(indoor_slot_requirement).distance_used_meters).to eq(0)
    end
  end

  describe "moving time as the only active dimension" do
    it "computes and drives status from strava_activities.moving_time" do
      component, bike = build_component
      wax = create(:service_type, user: component.user, name: "Service")
      requirement = create(:component_service_requirement, component: component, name: "Hours-based service",
        moving_time_seconds: 10.hours.to_i, distance_interval_meters: nil, service_type: wax)

      # 9.6h used of a 10h threshold -- within the default 5% warning band
      # ((1 - 0.96) = 0.04 <= 0.05).
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), moving_time: 34_560, distance_meters: 1)

      result = status_for(requirement)

      expect(result.moving_time_used_seconds).to eq(34_560)
      expect(result.moving_time_remaining_seconds).to eq(1_440)
      expect(result.driving_dimension).to eq(:moving_time)
      expect(result.status).to eq("warning")
    end
  end

  describe "calendar dimension: months/years, including end-of-month clamping" do
    it "a 1-month requirement serviced on Jan 31 is due Feb 28 in a non-leap year" do
      component, bike = build_component(acquired_on: Date.new(2025, 1, 1))
      wax = create(:service_type, user: component.user, name: "Service")
      requirement = create(:component_service_requirement, component: component, name: "Monthly",
        distance_interval_meters: nil, calendar_amount: 1, calendar_unit: "month", service_type: wax)
      create(:maintenance_event, component: component, service_type: wax, performed_at: Time.zone.local(2026, 1, 31, 9, 0))

      result = status_for(requirement)
      expected_due = Date.new(2026, 1, 31).advance(months: 1)

      expect(expected_due).to eq(Date.new(2026, 2, 28))
      expect(result.days_remaining).to eq((expected_due - Date.current).to_i)
    end

    it "a 1-month requirement serviced on Jan 31 of a leap year is due Feb 29" do
      component, = build_component(acquired_on: Date.new(2027, 1, 1))
      wax = create(:service_type, user: component.user, name: "Service")
      requirement = create(:component_service_requirement, component: component, name: "Monthly",
        distance_interval_meters: nil, calendar_amount: 1, calendar_unit: "month", service_type: wax)
      create(:maintenance_event, component: component, service_type: wax, performed_at: Time.zone.local(2028, 1, 31, 9, 0))

      result = status_for(requirement)
      expected_due = Date.new(2028, 1, 31).advance(months: 1)

      expect(expected_due).to eq(Date.new(2028, 2, 29)) # 2028 is a leap year
      expect(result.days_remaining).to eq((expected_due - Date.current).to_i)
    end

    it "a 1-year requirement advances by real calendar years" do
      component, = build_component(acquired_on: Date.new(2020, 1, 1))
      wax = create(:service_type, user: component.user, name: "Service")
      requirement = create(:component_service_requirement, component: component, name: "Yearly",
        distance_interval_meters: nil, calendar_amount: 1, calendar_unit: "year", service_type: wax)
      create(:maintenance_event, component: component, service_type: wax, performed_at: Time.zone.local(2024, 6, 1, 9, 0))

      result = status_for(requirement)
      expected_due = Date.new(2024, 6, 1).advance(years: 1)

      expect(result.days_remaining).to eq((expected_due - Date.current).to_i)
    end
  end

  describe "driving_dimension picks whichever active dimension is furthest along" do
    def requirement_with_all_three(component, wax)
      create(:component_service_requirement, component: component, name: "All three",
        distance_meters: 1_000_000, moving_time_seconds: 100.hours.to_i, calendar_amount: 10, calendar_unit: "year",
        service_type: wax)
    end

    it "picks distance when it is furthest along" do
      component, bike = build_component
      wax = create(:service_type, user: component.user, name: "Service")
      requirement = requirement_with_all_three(component, wax)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), distance_meters: 990_000, moving_time: 1.hour.to_i)

      expect(status_for(requirement).driving_dimension).to eq(:distance)
    end

    it "picks moving_time when it is furthest along" do
      component, bike = build_component
      wax = create(:service_type, user: component.user, name: "Service")
      requirement = requirement_with_all_three(component, wax)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), distance_meters: 1_000, moving_time: 99.hours.to_i)

      expect(status_for(requirement).driving_dimension).to eq(:moving_time)
    end

    it "picks calendar (:days) when it is furthest along" do
      component, = build_component(acquired_on: Date.new(2016, 1, 1))
      wax = create(:service_type, user: component.user, name: "Service")
      requirement = requirement_with_all_three(component, wax)

      expect(status_for(requirement).driving_dimension).to eq(:days)
    end

    it "breaks an exact tie in priority order distance > moving_time > calendar" do
      component, bike = build_component
      wax = create(:service_type, user: component.user, name: "Service")
      requirement = create(:component_service_requirement, component: component, name: "Tied",
        distance_meters: 1_000_000, moving_time_seconds: 100.hours.to_i, service_type: wax)
      # Exactly 50% on both distance and moving_time.
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), distance_meters: 500_000, moving_time: 50.hours.to_i)

      expect(status_for(requirement).driving_dimension).to eq(:distance)
    end
  end

  describe "no matching event yet: the synthetic fallback point" do
    it "computes the same plain fraction as a component with no logged service" do
      component, bike = build_component(acquired_on: Date.new(2026, 1, 1))
      wax = create(:service_type, user: component.user, name: "Service")
      requirement = create(:component_service_requirement, component: component, name: "Fresh",
        distance_meters: 1_000_000, service_type: wax)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), distance_meters: 250_000)

      result = status_for(requirement)

      expect(result.distance_used_meters).to eq(250_000)
      expect(result.distance_remaining_meters).to eq(750_000)
      expect(result.setting_event).to be_nil
      expect(result.status).to eq("ok")
    end
  end

  describe "an exact due-point tie prefers the later candidate" do
    it "a later event wins over an earlier one when their due points are identical" do
      component, bike = build_component
      a_type = create(:service_type, user: component.user, name: "Service A")
      b_type = create(:service_type, user: component.user, name: "Service B")
      requirement = create(:component_service_requirement, component: component, name: "Tie",
        distance_meters: 1_000_000, service_type: a_type)
      create(:service_requirement_satisfier, owner: requirement, service_type: b_type, position: 2,
        allowance_distance_meters: 700_000)

      # Service A at 0km (due 0+1,000,000 = 1,000,000) vs service B at
      # 300km (due 300,000+700,000 = 1,000,000) -- exact tie, B is later.
      create(:maintenance_event, component: component, service_type: a_type, performed_at: Time.zone.local(2026, 1, 1, 9, 0))
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 15), distance_meters: 300_000)
      create(:maintenance_event, component: component, service_type: b_type, performed_at: Time.zone.local(2026, 1, 15, 9, 0))

      result = status_for(requirement)

      expect(result.setting_event.service_type).to eq(b_type)
      expect(result.setting_position).to eq(300_000)
    end
  end

  describe "parity between .for_user and .for_component across mixed satisfiers and every ride_filter" do
    it "produces identical results via either entry point" do
      user = create(:user)
      hot_wax = create(:service_type, user: user, name: "Hot Wax")
      drip_wax = create(:service_type, user: user, name: "Drip Wax")

      bikes = {}
      components = %w[all outdoor indoor].map do |ride_filter|
        bike = create(:bike, user: user)
        bikes[ride_filter] = bike
        component = create(:component, user: user, category: "chain", acquired_on: Date.new(2026, 1, 1), label: "Chain #{ride_filter}")
        create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1))
        requirement = create(:component_service_requirement, component: component, name: "Lube",
          distance_meters: 500_000, ride_filter: ride_filter, service_type: hot_wax)
        create(:service_requirement_satisfier, owner: requirement, service_type: drip_wax, position: 2,
          allowance_distance_meters: 250_000)
        create(:maintenance_event, component: component, service_type: hot_wax, performed_at: Time.zone.local(2026, 1, 1, 9, 0))
        [ component, requirement ]
      end

      bikes.each_value do |bike|
        create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), distance_meters: 300_000, trainer: false)
        create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 2), distance_meters: 40_000, trainer: true)
      end

      by_user = described_class.for_user(user).index_by { |r| r.component_service_requirement.id }

      components.each do |component, requirement|
        by_component = described_class.for_component(component).find { |r| r.component_service_requirement.id == requirement.id }
        user_result = by_user[requirement.id]

        expect(by_component.status).to eq(user_result.status)
        expect(by_component.distance_used_meters).to eq(user_result.distance_used_meters)
        expect(by_component.distance_remaining_meters).to eq(user_result.distance_remaining_meters)
        expect(by_component.setting_event&.id).to eq(user_result.setting_event&.id)
      end
    end
  end
end
