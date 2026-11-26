require "rails_helper"

RSpec.describe Maintenance::EventLog do
  let(:user) { create(:user) }
  let(:road) { create(:bike, user: user, name: "Soloist") }
  let(:gravel) { create(:bike, user: user, name: "Libre") }
  let(:wax) { create(:service_type, user: user, name: "Drip wax") }
  let(:clean) { create(:service_type, user: user, name: "Degrease") }
  let(:chain) { create(:component, user: user, label: "Chain S1", category: "chain", brand: "KMC") }

  def at(month, day, hour = 12)
    Time.zone.local(2026, month, day, hour)
  end

  def event(component = chain, performed_at = at(1, 10), type: wax, notes: "", session: nil)
    create(:maintenance_event, component: component, service_type: type, performed_at: performed_at, notes: notes,
      service_session: session)
  end

  def session_with(bike, performed_at, events, notes: nil)
    session = create(:service_session, bike: bike, user: user, performed_at: performed_at, notes: notes)
    events.each { |component, type| event(component, performed_at, type: type, session: session) }
    session
  end

  def ride(bike, moved_at, meters, trainer: false)
    create(:strava_activity, user: user, bike: bike, moved_at: moved_at, distance_meters: meters, trainer: trainer)
  end

  def ids(result)
    result.events.map { |e| e[:id] }
  end

  def call(**kwargs)
    described_class.call(user, **kwargs)
  end

  describe "filters" do
    it "filters by kinds: session events vs single events" do
      single = event
      session = session_with(road, at(1, 12), [ [ chain, clean ] ])

      expect(ids(call(kinds: [ "single" ]))).to eq([ single.id ])
      expect(ids(call(kinds: [ "session" ]))).to eq(session.maintenance_events.pluck(:id))
      expect(ids(call(kinds: %w[session single])).size).to eq(2)
    end

    it "filters by the bike at the time: a session's bike, or where the component was mounted" do
      create(:component_assignment, component: chain, bike: road, started_at: at(1, 1), ended_at: at(2, 1))
      create(:component_assignment, component: chain, bike: gravel, started_at: at(2, 1))
      on_road = event(chain, at(1, 15))
      on_gravel = event(chain, at(2, 15))
      other = create(:component, user: user, category: "cassette")
      session = session_with(road, at(3, 1), [ [ other, wax ] ])

      expect(ids(call(bike_id: road.id))).to contain_exactly(on_road.id, session.maintenance_events.first.id)
      expect(ids(call(bike_id: gravel.id))).to eq([ on_gravel.id ])
    end

    it "filters by category and service type" do
      cassette = create(:component, user: user, category: "cassette")
      chain_wax = event(chain, at(1, 1), type: wax)
      chain_clean = event(chain, at(1, 2), type: clean)
      event(cassette, at(1, 3), type: clean)

      expect(ids(call(category: "chain"))).to contain_exactly(chain_wax.id, chain_clean.id)
      expect(ids(call(service_type_id: wax.id))).to eq([ chain_wax.id ])
    end

    it "searches service type, component label/brand/model, event notes and session notes" do
      by_type = event(chain, at(1, 1), type: clean)
      by_note = event(create(:component, user: user, label: "Cassette"), at(1, 2), notes: "used the new lube")
      session = session_with(road, at(1, 3), [ [ create(:component, user: user, label: "Tire"), wax ] ], notes: "Pre-race check")

      expect(ids(call(q: "degr"))).to eq([ by_type.id ])
      expect(ids(call(q: "LUBE"))).to eq([ by_note.id ])
      expect(ids(call(q: "kmc"))).to contain_exactly(by_type.id)
      expect(ids(call(q: "pre-race"))).to eq(session.maintenance_events.pluck(:id))
      expect(ids(call(q: "100%"))).to be_empty # LIKE wildcards are literal
    end

    it "reads from/to as days in the viewer's timezone" do
      # 2026-03-01 02:00 UTC is still Feb 28 in New York.
      late_feb = event(chain, Time.utc(2026, 3, 1, 2))
      march = event(chain, Time.utc(2026, 3, 1, 12))

      expect(ids(call(from: "2026-03-01", to: "2026-03-31", tz: "America/New_York"))).to eq([ march.id ])
      expect(ids(call(from: "2026-02-28", to: "2026-02-28", tz: "America/New_York"))).to eq([ late_feb.id ])
      expect(ids(call(from: "2026-03-01", to: "2026-03-01", tz: "UTC"))).to contain_exactly(late_feb.id, march.id)
    end

    it "rejects an unknown group or sort" do
      expect { call(group: "week") }.to raise_error(described_class::InvalidParamError)
      expect { call(sort: "label") }.to raise_error(described_class::InvalidParamError)
    end
  end

  describe "keyset paging (date order)" do
    it "pages with no duplicates or gaps, keeping a session's events contiguous across a boundary" do
      singles = (1..5).map { |n| event(chain, at(1, n)) }
      components = (1..3).map { |n| create(:component, user: user, label: "Part #{n}") }
      session = session_with(road, at(1, 3, 15), components.map { |c| [ c, wax ] })

      seen = []
      cursor = nil
      pages = 0
      loop do
        result = call(per_page: 3, cursor: cursor)
        seen.concat(ids(result))
        pages += 1
        cursor = result.next_cursor
        break unless cursor
      end

      expect(pages).to eq(3)
      expect(seen).to match_array(singles.map(&:id) + session.maintenance_events.pluck(:id))
      expect(seen.uniq.size).to eq(seen.size)
      positions = session.maintenance_events.pluck(:id).map { |id| seen.index(id) }.sort
      expect(positions).to eq((positions.first..positions.last).to_a)
    end

    it "orders oldest first with order=asc" do
      older = event(chain, at(1, 1))
      newer = event(chain, at(1, 2))
      expect(ids(call(order: "asc"))).to eq([ older.id, newer.id ])
      expect(ids(call)).to eq([ newer.id, older.id ])
    end
  end

  describe "since last (same service type)" do
    it "is nil for the first, and the component's distance since the previous same-type event" do
      create(:component_assignment, component: chain, bike: road, started_at: at(1, 1))
      first_wax = event(chain, at(1, 10), type: wax)
      ride(road, at(1, 12), 30_000)
      clean_between = event(chain, at(1, 15), type: clean)
      ride(road, at(1, 20), 20_000)
      second_wax = event(chain, at(1, 25), type: wax)

      by_id = call.events.index_by { |e| e[:id] }
      expect(by_id[first_wax.id][:since_last_same_type_meters]).to be_nil
      expect(by_id[clean_between.id][:since_last_same_type_meters]).to be_nil # its own type's first
      expect(by_id[second_wax.id][:since_last_same_type_meters]).to eq(50_000) # the clean between doesn't reset it
      expect(by_id[second_wax.id][:component_distance_at_event_meters]).to eq(50_000)
    end

    it "counts only the rides a split indoor/outdoor slot gives the component" do
      outdoor = create(:component, user: user, category: "cassette", label: "Outdoor cassette")
      create(:component_assignment, component: outdoor, bike: road, started_at: at(1, 1), ride_context: "outdoor_only")
      event(outdoor, at(1, 2))
      ride(road, at(1, 5), 40_000)
      ride(road, at(1, 6), 25_000, trainer: true)
      later = event(outdoor, at(1, 10))

      expect(call.events.find { |e| e[:id] == later.id }[:since_last_same_type_meters]).to eq(40_000)
    end

    it "uses the previous event even when filters hide it" do
      create(:component_assignment, component: chain, bike: road, started_at: at(1, 1))
      event(chain, at(1, 2), notes: "hidden")
      ride(road, at(1, 5), 12_000)
      shown = event(chain, at(2, 2), notes: "shown")

      result = call(q: "shown")
      expect(result.events.map { |e| [ e[:id], e[:since_last_same_type_meters] ] }).to eq([ [ shown.id, 12_000 ] ])
    end
  end

  describe "the bike at the time and bike km" do
    it "shows the mounted bike, off the bike, and each side of a swap" do
      off_bike_early = event(chain, at(1, 1))
      create(:component_assignment, component: chain, bike: road, started_at: at(1, 5), ended_at: at(2, 1))
      create(:component_assignment, component: chain, bike: gravel, started_at: at(2, 1))
      ride(road, at(1, 3), 5_000)  # before the chain was on, still on the bike's odometer
      ride(road, at(1, 10), 7_000)
      ride(gravel, at(1, 20), 100_000)
      on_road = event(chain, at(1, 20))
      on_gravel = event(chain, at(2, 10))

      by_id = call.events.index_by { |e| e[:id] }
      expect(by_id[off_bike_early.id]).to include(bike: nil, bike_distance_at_event_meters: nil)
      expect(by_id[on_road.id]).to include(bike: { id: road.id, name: "Soloist" }, bike_distance_at_event_meters: 12_000)
      expect(by_id[on_gravel.id]).to include(bike: { id: gravel.id, name: "Libre" }, bike_distance_at_event_meters: 100_000)
    end

    it "uses the session's bike for a session event" do
      session = session_with(gravel, at(1, 5), [ [ chain, wax ] ])
      expect(call.events.first[:bike]).to eq(id: gravel.id, name: "Libre")
      expect(call.sessions[session.id]).to include(bike: { id: gravel.id, name: "Libre" }, event_count: 1, matching_count: 1)
    end
  end

  describe "resets" do
    it "names each enabled requirement whose effective satisfiers include the type" do
      custom = create(:component_service_requirement, component: chain, name: "Wax", service_type: wax)
      create(:component_service_requirement, component: chain, name: "Off", service_type: wax, enabled: false)
      template = create(:category_service_requirement, user: user, name: "Clean drivetrain", service_type: clean)
      create(:service_requirement_satisfier, owner: template, service_type: wax, position: 2)
      create(:component_service_requirement, component: chain, category_service_requirement: template)
      waxed = event(chain, at(1, 1), type: wax)
      cleaned = event(chain, at(1, 2), type: clean)

      by_id = call.events.index_by { |e| e[:id] }
      expect(custom.effective_name).to eq("Wax")
      expect(by_id[waxed.id][:resets]).to eq([ "Clean drivetrain", "Wax" ])
      expect(by_id[cleaned.id][:resets]).to eq([ "Clean drivetrain" ])
    end
  end

  describe "service_session_id (internal)" do
    it "keeps only that session's services" do
      session = session_with(road, at(1, 5), [ [ chain, wax ], [ chain, clean ] ])
      event(chain, at(1, 6))
      expect(ids(call(service_session_id: session.id, order: "asc"))).to eq(session.maintenance_events.order(:id).pluck(:id))
    end
  end

  describe "sessions" do
    it "reports how many of a session's events the filters keep" do
      cassette = create(:component, user: user, category: "cassette")
      session = session_with(road, at(1, 5), [ [ chain, wax ], [ chain, clean ], [ cassette, clean ] ])

      expect(call(category: "chain").sessions[session.id]).to include(event_count: 3, matching_count: 2)
    end
  end

  describe "meta" do
    it "counts kinds under every filter but kinds, and totals matching events" do
      event(chain, at(1, 1))
      event(chain, at(1, 2))
      session_with(road, at(1, 3), [ [ chain, wax ], [ chain, clean ] ])

      meta = call(kinds: [ "single" ]).meta
      expect(meta[:kind_counts]).to eq(session: 1, single: 2)
      expect(meta[:total]).to eq(2)
    end

    it "gives the same month totals on both sides of a page boundary" do
      6.times { |n| event(chain, at(3, n + 1)) }
      session_with(road, at(3, 20), [ [ create(:component, user: user), wax ] ])
      event(chain, at(2, 1))

      page1 = call(per_page: 4, tz: "UTC")
      page2 = call(per_page: 4, tz: "UTC", cursor: page1.next_cursor)

      march = { services: 7, sessions: 1, components: 2 }
      expect(page1.meta[:month_totals]).to eq("2026-03" => march)
      expect(page2.meta[:month_totals]).to eq("2026-03" => march, "2026-02" => { services: 1, sessions: 0, components: 1 })
    end

    it "totals a component's matching services for the Component bands" do
      cassette = create(:component, user: user, label: "A cassette", category: "cassette")
      3.times { |n| event(chain, at(1, n + 1)) }
      event(cassette, at(1, 9))

      result = call(group: "component", per_page: 2)
      expect(result.events.map { |e| e[:component][:label] }).to eq([ "A cassette", "Chain S1" ])
      expect(result.meta[:component_totals]).to eq(cassette.id.to_s => 1, chain.id.to_s => 3)
      expect(call(group: "component", per_page: 2, page: result.next_cursor).events.size).to eq(2)
    end

    it "gives this year's tiles in the viewer's zone, ignoring the filters" do
      travel_to Time.utc(2026, 11, 25, 12) do
        cassette = create(:component, user: user, label: "Cassette", category: "cassette")
        event(chain, Time.utc(2025, 12, 31, 12)) # last year
        event(chain, Time.utc(2026, 1, 1, 3)) # Dec 31, 2025 in New York
        3.times { |n| event(chain, Time.utc(2026, 5, n + 1)) }
        latest = event(cassette, Time.utc(2026, 11, 1))
        session_with(road, Time.utc(2026, 6, 1), [ [ cassette, wax ] ])

        tiles = call(tz: "America/New_York", category: "nothing").meta[:tiles]
        expect(tiles).to include(services_this_year: 5, sessions_this_year: 1)
        expect(tiles[:last_service_at]).to eq(latest.performed_at)
        expect(tiles[:most_serviced]).to eq(component_id: chain.id, label: "Chain S1", count: 3)
      end
    end
  end

  describe "field sorts" do
    it "sorts by component km or since last, nulls last, paging by offset" do
      create(:component_assignment, component: chain, bike: road, started_at: at(1, 1))
      first = event(chain, at(1, 2))
      ride(road, at(1, 5), 10_000)
      second = event(chain, at(1, 10))
      ride(road, at(1, 15), 30_000)
      third = event(chain, at(1, 20))

      expect(ids(call(sort: "component_km", order: "desc"))).to eq([ third.id, second.id, first.id ])
      expect(ids(call(sort: "component_km", order: "asc"))).to eq([ first.id, second.id, third.id ])
      expect(ids(call(sort: "since_last", order: "desc"))).to eq([ third.id, second.id, first.id ])
      expect(ids(call(sort: "since_last", order: "asc"))).to eq([ second.id, third.id, first.id ])

      page1 = call(sort: "since_last", per_page: 2)
      expect(page1.next_cursor).to eq("2")
      expect(ids(call(sort: "since_last", per_page: 2, page: 2))).to eq([ first.id ])
    end
  end

  describe "isolation" do
    it "never returns another user's events, even filtered by their ids" do
      other = create(:user)
      other_bike = create(:bike, user: other)
      other_type = create(:service_type, user: other)
      other_event = create(:maintenance_event, component: create(:component, user: other), service_type: other_type)
      create(:component_assignment, component: other_event.component, bike: other_bike, started_at: at(1, 1) - 1.year)
      mine = event

      expect(ids(call)).to eq([ mine.id ])
      expect(ids(call(bike_id: other_bike.id))).to be_empty
      expect(ids(call(service_type_id: other_type.id))).to be_empty
      expect(call.meta[:tiles][:most_serviced][:component_id]).to eq(chain.id)
    end
  end
end
