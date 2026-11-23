require "rails_helper"

RSpec.describe Activity::Feed do
  describe ".call" do
    it "tie-breaks equal timestamps by kind rank then id, consistently with the requested order" do
      user = create(:user)
      bike = create(:bike, user: user)
      component = create(:component, user: user, category: "chain")
      tied_at = Time.zone.local(2026, 1, 10, 12, 0)

      ride = create(:strava_activity, user: user, bike: bike, moved_at: tied_at)
      event = create(:maintenance_event, component: component, performed_at: tied_at)

      desc = described_class.call(user, kinds: %w[ride service], order: "desc")
      tied_desc = desc.items.select { |item| item[:occurred_at] == tied_at }
      # kind_rank's own tie-break direction follows the overall order param --
      # required for the keyset tuple comparison (occurred_at, kind_rank,
      # source_id) to stay internally consistent, not an arbitrary choice.
      expect(tied_desc.map { |item| item[:kind] }).to eq([ "maintenance_event", "ride" ])
      expect(tied_desc.last[:id]).to eq(ride.id)

      asc = described_class.call(user, kinds: %w[ride service], order: "asc")
      tied_asc = asc.items.select { |item| item[:occurred_at] == tied_at }
      expect(tied_asc.map { |item| item[:kind] }).to eq([ "ride", "maintenance_event" ])
    end

    it "paginates by keyset with no duplicates or gaps across pages, in both orders" do
      user = create(:user)
      bike = create(:bike, user: user)
      12.times { |n| create(:strava_activity, user: user, bike: bike, moved_at: Time.zone.local(2026, 1, n + 1, 12, 0)) }

      [ "desc", "asc" ].each do |order|
        page1 = described_class.call(user, order: order, per_page: 5)
        page2 = described_class.call(user, order: order, per_page: 5, cursor: page1.next_cursor)
        page3 = described_class.call(user, order: order, per_page: 5, cursor: page2.next_cursor)

        all_ids = (page1.items + page2.items + page3.items).map { |item| item[:id] }
        expect(all_ids.uniq.size).to eq(12)
        expect(page3.next_cursor).to be_nil
      end
    end

    it "keeps pages stable when a new row is inserted between fetches" do
      user = create(:user)
      bike = create(:bike, user: user)
      5.times { |n| create(:strava_activity, user: user, bike: bike, moved_at: Time.zone.local(2026, 1, n + 1, 12, 0)) }

      page1 = described_class.call(user, order: "desc", per_page: 2)
      create(:strava_activity, user: user, bike: bike, moved_at: Time.zone.local(2026, 1, 3, 13, 0))
      page2 = described_class.call(user, order: "desc", per_page: 2, cursor: page1.next_cursor)

      expect(page1.items.map { |i| i[:id] } & page2.items.map { |i| i[:id] }).to be_empty
    end

    describe "filters" do
      it "filters rides by bike_id" do
        user = create(:user)
        bike = create(:bike, user: user)
        other_bike = create(:bike, user: user)
        wanted = create(:strava_activity, user: user, bike: bike, moved_at: 1.day.ago)
        create(:strava_activity, user: user, bike: other_bike, moved_at: 1.day.ago)

        result = described_class.call(user, bike_id: bike.id)

        expect(result.items.map { |i| i[:id] }).to eq([ wanted.id ])
      end

      it "filters by date range in a non-UTC timezone" do
        user = create(:user)
        bike = create(:bike, user: user)
        # Jan 1 06:00 UTC = Dec 31 22:00 in America/Phoenix (UTC-7) -- still "Dec 31" there.
        in_range = create(:strava_activity, user: user, bike: bike, moved_at: Time.utc(2026, 1, 1, 6, 0))
        out_of_range = create(:strava_activity, user: user, bike: bike, moved_at: Time.utc(2026, 1, 2, 6, 0))

        result = described_class.call(user, from: "2025-12-31", to: "2025-12-31", tz: "America/Phoenix")

        expect(result.items.map { |i| i[:id] }).to eq([ in_range.id ])
        expect(result.items.map { |i| i[:id] }).not_to include(out_of_range.id)
      end

      it "filters rides by name, case-insensitively" do
        user = create(:user)
        bike = create(:bike, user: user)
        wanted = create(:strava_activity, user: user, bike: bike, name: "Morning Gravel Ride", moved_at: 1.day.ago)
        create(:strava_activity, user: user, bike: bike, name: "Zwift session", moved_at: 1.day.ago)

        result = described_class.call(user, q: "gravel")

        expect(result.items.map { |i| i[:id] }).to eq([ wanted.id ])
      end

      it "excludes non-ride kinds entirely when q is given" do
        user = create(:user)
        bike = create(:bike, user: user)
        component = create(:component, user: user, category: "chain")
        create(:strava_activity, user: user, bike: bike, name: "Morning Ride", moved_at: 1.day.ago)
        create(:maintenance_event, component: component, performed_at: 1.day.ago)

        result = described_class.call(user, kinds: %w[ride service], q: "ride")

        expect(result.items.map { |i| i[:kind] }).to eq([ "ride" ])
        expect(result.meta[:kind_counts][:service]).to eq(0)
      end

      it "filters rides by component_id using the same ride_context rules as CountedTowardQuery, including a split indoor/outdoor cassette slot" do
        user = create(:user)
        bike = create(:bike, user: user)
        ComponentCategorySetting.find_or_initialize_by(user: user, category: "cassette").update!(allows_multiple_assignments: true)
        outdoor_cassette = create(:component, user: user, category: "cassette", label: "Road cassette")
        indoor_cassette = create(:component, user: user, category: "cassette", label: "Trainer cassette")
        create(:component_assignment, component: outdoor_cassette, bike: bike, ride_context: "outdoor_only", started_at: 10.days.ago)
        create(:component_assignment, component: indoor_cassette, bike: bike, ride_context: "indoor_only", started_at: 10.days.ago)

        outdoor_ride = create(:strava_activity, user: user, bike: bike, moved_at: 5.days.ago, trainer: false, activity_type: "Ride")
        trainer_ride = create(:strava_activity, user: user, bike: bike, moved_at: 4.days.ago, trainer: true, activity_type: "Ride")

        outdoor_result = described_class.call(user, component_id: outdoor_cassette.id)
        indoor_result = described_class.call(user, component_id: indoor_cassette.id)

        expect(outdoor_result.items.map { |i| i[:id] }).to eq([ outdoor_ride.id ])
        expect(indoor_result.items.map { |i| i[:id] }).to eq([ trainer_ride.id ])
      end

      it "filters service/setup entries by their own component_id" do
        user = create(:user)
        bike = create(:bike, user: user)
        component = create(:component, user: user, category: "chain")
        other_component = create(:component, user: user, category: "cassette")
        event = create(:maintenance_event, component: component, performed_at: 1.day.ago)
        create(:maintenance_event, component: other_component, performed_at: 1.day.ago)
        assignment = create(:component_assignment, component: component, bike: bike, started_at: 10.days.ago)
        create(:component_assignment, component: other_component, bike: bike, started_at: 10.days.ago)

        result = described_class.call(user, kinds: %w[service setup], component_id: component.id)

        ids = result.items.map { |i| [ i[:kind], i[:id] ] }
        expect(ids).to contain_exactly([ "maintenance_event", event.id ], [ "setup_change", assignment.id ])
      end
    end

    it "shows a session-less maintenance event as maintenance_event, and never surfaces a session's own events outside the session" do
      user = create(:user)
      bike = create(:bike, user: user)
      component = create(:component, user: user, category: "chain")
      standalone = create(:maintenance_event, component: component, performed_at: 2.days.ago)
      session = create(:service_session, bike: bike, user: user, performed_at: 1.day.ago)
      create(:maintenance_event, component: component, service_session: session, performed_at: 1.day.ago)

      result = described_class.call(user, kinds: %w[service])

      kinds = result.items.map { |i| i[:kind] }
      expect(kinds).to contain_exactly("maintenance_event", "service_session")
      standalone_item = result.items.find { |i| i[:kind] == "maintenance_event" }
      expect(standalone_item[:id]).to eq(standalone.id)
      session_item = result.items.find { |i| i[:kind] == "service_session" }
      expect(session_item[:item_count]).to eq(1)
    end

    it "derives a session-less event's bike from the component_assignment active at performed_at" do
      user = create(:user)
      bike = create(:bike, user: user)
      component = create(:component, user: user, category: "chain")
      create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      event = create(:maintenance_event, component: component, performed_at: Time.zone.local(2026, 1, 5))

      result = described_class.call(user, kinds: %w[service])

      item = result.items.find { |i| i[:id] == event.id }
      expect(item[:bike]).to eq(id: bike.id, name: bike.name)
    end

    describe "the install/removal merge rule" do
      it "merges a same-slot swap within the small boundary tolerance into one replaced entry" do
        user = create(:user)
        bike = create(:bike, user: user)
        old_component = create(:component, user: user, category: "chain", label: "Chain A")
        new_component = create(:component, user: user, category: "chain", label: "Chain B")
        # The hand-made, two-action swap path (Remove, then Install
        # separately) always has a small real gap -- two separate requests
        # can never land on the exact same timestamp -- which is what this
        # tolerance papers over. The one-step swap endpoint
        # (ComponentAssignments::Swap) produces an exact boundary instead;
        # see the spec just below this one.
        removed_at = Time.zone.local(2026, 2, 1, 9, 0)
        installed_at = removed_at + 10.seconds

        create(:component_assignment, component: old_component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: removed_at)
        new_assignment = create(:component_assignment, component: new_component, bike: bike, started_at: installed_at, ended_at: nil)

        result = described_class.call(user, kinds: %w[setup])

        setup_items = result.items.select { |i| i[:kind] == "setup_change" }
        # The old component's own initial install (back on 2026-01-01) is
        # untouched by the merge -- only the removed/installed pair at the
        # swap boundary collapses into one "replaced" entry.
        expect(setup_items.size).to eq(2)
        merged = setup_items.find { |i| i[:action] == "replaced" }
        expect(merged[:id]).to eq(new_assignment.id)
        expect(merged[:component]).to eq(id: new_component.id, label: "Chain B")
        expect(merged[:replaced_component]).to eq(id: old_component.id, label: "Chain A")
        expect(merged[:summary]).to eq("Installed Chain B on #{bike.name}, replacing Chain A")
      end

      it "merges a one-step swap (ComponentAssignments::Swap), whose boundary is exact, into one replaced entry" do
        user = create(:user)
        bike = create(:bike, user: user)
        old_component = create(:component, user: user, category: "chain", label: "Chain A")
        new_component = create(:component, user: user, category: "chain", label: "Chain B")
        swapped_at = Time.zone.local(2026, 2, 1, 9, 0)
        assignment = create(:component_assignment, component: old_component, bike: bike,
          started_at: Time.zone.local(2026, 1, 1), ended_at: nil)

        swap_result = ComponentAssignments::Swap.call(assignment: assignment, component: new_component, swapped_at: swapped_at)
        expect(swap_result).to be_success

        result = described_class.call(user, kinds: %w[setup])

        setup_items = result.items.select { |i| i[:kind] == "setup_change" }
        # The old component's own initial install (back on 2026-01-01) is
        # untouched by the merge -- same as the hand-made-swap spec above --
        # only the swap's own removed/installed pair collapses into one
        # "replaced" entry.
        expect(setup_items.size).to eq(2)
        merged = setup_items.find { |i| i[:action] == "replaced" }
        expect(merged[:id]).to eq(swap_result.new_assignment.id)
        expect(merged[:component]).to eq(id: new_component.id, label: "Chain B")
        expect(merged[:replaced_component]).to eq(id: old_component.id, label: "Chain A")
      end

      it "does not merge when the gap exceeds the tolerance" do
        user = create(:user)
        bike = create(:bike, user: user)
        old_component = create(:component, user: user, category: "chain", label: "Chain A")
        new_component = create(:component, user: user, category: "chain", label: "Chain B")
        removed_at = Time.zone.local(2026, 2, 1, 9, 0)

        create(:component_assignment, component: old_component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: removed_at)
        create(:component_assignment, component: new_component, bike: bike, started_at: removed_at + 5.minutes, ended_at: nil)

        result = described_class.call(user, kinds: %w[setup])

        setup_items = result.items.select { |i| i[:kind] == "setup_change" && i[:occurred_at] >= removed_at }
        expect(setup_items.map { |i| i[:action] }).to contain_exactly("removed", "installed")
      end

      it "does not merge when ride_context differs, even at the same bike/category/timestamp" do
        user = create(:user)
        bike = create(:bike, user: user)
        ComponentCategorySetting.find_or_initialize_by(user: user, category: "cassette").update!(allows_multiple_assignments: true)
        removed_component = create(:component, user: user, category: "cassette", label: "Indoor cassette")
        installed_component = create(:component, user: user, category: "cassette", label: "Outdoor cassette")
        at = Time.zone.local(2026, 2, 1, 9, 0)

        create(:component_assignment, component: removed_component, bike: bike, ride_context: "indoor_only",
          started_at: Time.zone.local(2026, 1, 1), ended_at: at)
        create(:component_assignment, component: installed_component, bike: bike, ride_context: "outdoor_only",
          started_at: at, ended_at: nil)

        result = described_class.call(user, kinds: %w[setup])

        setup_items = result.items.select { |i| i[:kind] == "setup_change" && i[:occurred_at] >= at }
        expect(setup_items.map { |i| i[:action] }).to contain_exactly("removed", "installed")
      end
    end

    it "excludes every non-ride kind from ride_totals" do
      user = create(:user)
      bike = create(:bike, user: user)
      component = create(:component, user: user, category: "chain")
      create(:strava_activity, user: user, bike: bike, distance_meters: 10_000, moved_at: 1.day.ago)
      create(:maintenance_event, component: component, performed_at: 1.day.ago)
      create(:component_assignment, component: component, bike: bike, started_at: 1.day.ago)

      result = described_class.call(user, kinds: %w[ride service setup])

      expect(result.meta[:ride_totals][:count]).to eq(1)
      expect(result.meta[:ride_totals][:distance_meters]).to eq(10_000)
    end

    it "raises InvalidSortError for sort=distance unless kinds is exactly ['ride']" do
      user = create(:user)

      expect { described_class.call(user, kinds: %w[ride setup], sort: "distance") }
        .to raise_error(Activity::Feed::InvalidSortError)
      expect { described_class.call(user, kinds: %w[ride], sort: "distance") }.not_to raise_error
    end

    it "offset-paginates sort=distance rides by distance" do
      user = create(:user)
      bike = create(:bike, user: user)
      small = create(:strava_activity, user: user, bike: bike, distance_meters: 1_000, moved_at: 3.days.ago)
      big = create(:strava_activity, user: user, bike: bike, distance_meters: 9_000, moved_at: 2.days.ago)
      medium = create(:strava_activity, user: user, bike: bike, distance_meters: 5_000, moved_at: 1.day.ago)

      result = described_class.call(user, sort: "distance", order: "desc")

      expect(result.items.map { |i| i[:id] }).to eq([ big.id, medium.id, small.id ])
    end
  end

  describe "meta.week_totals" do
    let(:user) { create(:user) }
    let(:bike) { create(:bike, user: user, name: "Juan Solo") }
    let(:other_bike) { create(:bike, user: user, name: "Other") }
    let(:vancouver) { ActiveSupport::TimeZone["America/Vancouver"] }
    let(:tz) { "America/Vancouver" }

    def ride(local, distance: 1_000, on: bike, **attrs)
      create(:strava_activity, user: user, bike: on, moved_at: vancouver.parse(local), distance_meters: distance,
        moving_time: 600, total_elevation_gain: 10.0, **attrs)
    end

    def totals(**kwargs)
      described_class.call(user, tz: tz, **kwargs).meta[:week_totals]
    end

    it "groups by Monday-start weeks in the viewer's zone, not UTC" do
      # Sunday 23:30 in Vancouver is already Monday in UTC.
      ride("2026-03-15 23:30", distance: 2_000)
      ride("2026-03-16 08:00", distance: 5_000)

      week_totals = totals

      expect(week_totals.keys).to contain_exactly("2026-03-09", "2026-03-16")
      expect(week_totals["2026-03-09"]).to include(ride_count: 1, distance_meters: 2_000, moving_time: 600, total_elevation_gain: 10.0)
      expect(week_totals["2026-03-16"]).to include(ride_count: 1, distance_meters: 5_000)
    end

    it "counts the whole week under the filters, independent of page size, and the same on both pages of a split week" do
      5.times { |n| ride("2026-03-1#{n + 1} 12:00") }
      ride("2026-03-12 13:00", on: other_bike) # filtered out by bike

      full = totals(bike_id: bike.id, per_page: 50)
      first_page = described_class.call(user, tz: tz, bike_id: bike.id, per_page: 2)
      second_page = described_class.call(user, tz: tz, bike_id: bike.id, per_page: 2, cursor: first_page.next_cursor)

      expect(full["2026-03-09"][:ride_count]).to eq(5)
      expect(first_page.meta[:week_totals]).to eq(full)
      expect(second_page.meta[:week_totals]).to eq(full)
    end

    it "respects the date range and search" do
      ride("2026-03-10 12:00", name: "Hill repeats")
      ride("2026-03-11 12:00", name: "Recovery")
      ride("2026-03-14 12:00", name: "Hill climb")

      expect(totals(q: "hill")["2026-03-09"][:ride_count]).to eq(2)
      expect(totals(from: "2026-03-11", to: "2026-03-12")["2026-03-09"][:ride_count]).to eq(1)
    end

    it "respects the component filter" do
      chain = create(:component, user: user, category: "chain")
      create(:component_assignment, component: chain, bike: bike, started_at: vancouver.parse("2026-03-11 00:00"))
      ride("2026-03-10 12:00")
      ride("2026-03-12 12:00")

      expect(totals(component_id: chain.id)["2026-03-09"][:ride_count]).to eq(1)
    end

    it "reports nil for kinds that aren't selected, and counts service and merged setup changes" do
      ride("2026-03-10 12:00")
      session = create(:service_session, bike: bike, user: user, performed_at: vancouver.parse("2026-03-11 12:00"))
      chain_a = create(:component, user: user, category: "chain", label: "Chain A")
      chain_b = create(:component, user: user, category: "chain", label: "Chain B")
      create(:maintenance_event, component: chain_a, service_session: session, performed_at: session.performed_at)
      create(:maintenance_event, component: chain_a, performed_at: vancouver.parse("2026-03-12 12:00"))
      swap_at = vancouver.parse("2026-03-13 12:00")
      create(:component_assignment, component: chain_a, bike: bike, started_at: vancouver.parse("2026-03-01 12:00"), ended_at: swap_at)
      create(:component_assignment, component: chain_b, bike: bike, started_at: swap_at)

      rides_only = totals(kinds: %w[ride])["2026-03-09"]
      expect(rides_only).to include(ride_count: 1, service_count: nil, setup_count: nil)

      everything = totals(kinds: %w[ride service setup])["2026-03-09"]
      # The session and the session-less event; the swap's removal and
      # install read as one "replaced" row.
      expect(everything).to include(ride_count: 1, service_count: 2, setup_count: 1)

      service_only = totals(kinds: %w[service])["2026-03-09"]
      expect(service_only).to include(ride_count: nil, distance_meters: nil, service_count: 2)
    end

    it "is empty for an empty page" do
      expect(totals).to eq({})
    end
  end

  describe "include_meta: false" do
    it "returns the entries with no meta" do
      user = create(:user)
      ride = create(:strava_activity, user: user, bike: create(:bike, user: user), moved_at: 1.day.ago)

      result = described_class.call(user, include_meta: false)

      expect(result.items.map { |item| item[:id] }).to eq([ ride.id ])
      expect(result.meta).to be_nil
    end
  end
end
