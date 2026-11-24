require "rails_helper"

RSpec.describe Components::LifeHistory do
  let(:user) { create(:user) }
  let(:road) { create(:bike, user: user, name: "Soloist") }
  let(:trainer_bike) { create(:bike, user: user, name: "Juan Solo") }
  let(:wax) { create(:service_type, user: user, name: "Drip wax") }

  def ride(bike, at, meters, trainer: false, type: "Ride", watts: nil, moving_time: 3_600, elevation: 100.0)
    create(:strava_activity, user: user, bike: bike, moved_at: at, distance_meters: meters, trainer: trainer,
           activity_type: type, moving_time: moving_time, total_elevation_gain: elevation,
           average_watts: watts, device_watts: !watts.nil?)
  end

  def event_at(component, at)
    create(:maintenance_event, component: component, service_type: wax, performed_at: at)
  end

  describe "assignments and lifetime stats" do
    it "match the Ruby per-assignment and lifetime methods across a swap and ride contexts" do
      chain = create(:component, user: user, category: "chain")
      swap = Time.zone.local(2026, 3, 1, 12)
      past = create(:component_assignment, component: chain, bike: road, started_at: Time.zone.local(2026, 1, 1), ended_at: swap)
      current = create(:component_assignment, component: chain, bike: trainer_bike, started_at: swap, ended_at: nil)

      ride(road, Time.zone.local(2026, 2, 1), 10_000, watts: 200)
      ride(road, swap, 7_000) # the swap instant belongs to the new window, on the other bike
      ride(road, Time.zone.local(2026, 2, 2), 4_000, trainer: true, watts: 150)
      ride(trainer_bike, Time.zone.local(2026, 4, 1), 20_000, watts: 251)
      ride(trainer_bike, Time.zone.local(2025, 12, 1), 99_000) # before any window

      result = described_class.call(chain.reload)

      expect(result.assignments.map { |a| a[:id] }).to eq([ current.id, past.id ]) # newest first
      expect(result.assignments.map { |a| a[:distance_meters] }).to eq([ current.distance_meters, past.distance_meters ])
      expect(result.assignments.first).to include(bike: { id: trainer_bike.id, name: "Juan Solo" }, ended_at: nil, ride_context: "both")
      expect(result.lifetime_stats).to include(
        distance_meters: chain.total_distance,
        moving_time_seconds: chain.total_moving_time,
        average_power: chain.average_power,
      )
      expect(result.lifetime_stats[:elevation_gain_meters]).to be_within(0.01).of(chain.total_elevation_gain)
    end

    it "lists both bikes of a shared indoor cassette, each with its own indoor distance" do
      cassette = create(:component, user: user, category: "cassette")
      on_road = create(:component_assignment, component: cassette, bike: road, ride_context: "indoor_only", started_at: Time.zone.local(2026, 1, 1))
      on_trainer = create(:component_assignment, component: cassette, bike: trainer_bike, ride_context: "indoor_only", started_at: Time.zone.local(2026, 2, 1))
      ride(road, Time.zone.local(2026, 1, 5), 30_000, trainer: true)
      ride(road, Time.zone.local(2026, 1, 6), 50_000) # outdoor: not this cassette's
      ride(trainer_bike, Time.zone.local(2026, 2, 5), 12_000, type: "VirtualRide")

      result = described_class.call(cassette)

      by_id = result.assignments.index_by { |a| a[:id] }
      expect(by_id[on_road.id][:distance_meters]).to eq(30_000)
      expect(by_id[on_trainer.id][:distance_meters]).to eq(12_000)
      expect(result.lifetime_stats[:distance_meters]).to eq(42_000)
    end

    it "is zeros and nil power with no rides, and empty with no assignments" do
      chain = create(:component, user: user, category: "chain")
      result = described_class.call(chain)

      expect(result.assignments).to eq([])
      expect(result.lifetime_stats).to eq(distance_meters: 0, moving_time_seconds: 0, elevation_gain_meters: 0, average_power: nil)
    end
  end

  describe "maintenance events" do
    it "gives each event the lifetime distance strictly before it" do
      chain = create(:component, user: user, category: "chain")
      create(:component_assignment, component: chain, bike: road, started_at: Time.zone.local(2026, 1, 1))
      before_rides = event_at(chain, Time.zone.local(2026, 1, 1, 6))
      ride(road, Time.zone.local(2026, 1, 2), 10_000)
      between = event_at(chain, Time.zone.local(2026, 1, 3))
      ride(road, Time.zone.local(2026, 1, 4), 5_000)
      same_instant = Time.zone.local(2026, 1, 5)
      ride(road, same_instant, 2_000)
      at_ride = event_at(chain, same_instant)

      by_id = described_class.call(chain).maintenance_events.index_by { |e| e[:id] }

      expect(by_id[before_rides.id][:component_distance_at_event_meters]).to eq(0)
      expect(by_id[between.id][:component_distance_at_event_meters]).to eq(10_000)
      expect(by_id[at_ride.id][:component_distance_at_event_meters]).to eq(15_000) # a ride at the same instant isn't before it
    end

    it "counts only the ride context each cassette accrues, across an indoor/outdoor split" do
      outdoor = create(:component, user: user, category: "cassette")
      indoor = create(:component, user: user, category: "cassette", label: "Trainer cassette")
      create(:component_assignment, component: outdoor, bike: road, ride_context: "outdoor_only", started_at: Time.zone.local(2026, 1, 1))
      create(:component_assignment, component: indoor, bike: road, ride_context: "indoor_only", started_at: Time.zone.local(2026, 1, 1))
      ride(road, Time.zone.local(2026, 1, 2), 40_000)
      ride(road, Time.zone.local(2026, 1, 3), 25_000, trainer: true)
      outdoor_event = event_at(outdoor, Time.zone.local(2026, 1, 10))
      indoor_event = event_at(indoor, Time.zone.local(2026, 1, 10))

      expect(described_class.call(outdoor).maintenance_events.first[:component_distance_at_event_meters]).to eq(40_000)
      expect(described_class.call(indoor).maintenance_events.first[:component_distance_at_event_meters]).to eq(25_000)
      expect([ outdoor_event, indoor_event ].map(&:component_id)).to eq([ outdoor.id, indoor.id ])
    end

    it "keeps counting across a removal: off-bike time adds nothing" do
      chain = create(:component, user: user, category: "chain")
      create(:component_assignment, component: chain, bike: road, started_at: Time.zone.local(2026, 1, 1), ended_at: Time.zone.local(2026, 2, 1))
      ride(road, Time.zone.local(2026, 1, 10), 8_000)
      ride(road, Time.zone.local(2026, 2, 10), 9_000) # after removal
      off_bike = event_at(chain, Time.zone.local(2026, 2, 15))

      event = described_class.call(chain).maintenance_events.first
      expect(event).to include(id: off_bike.id, component_distance_at_event_meters: 8_000, mounted_at_event: false)
    end

    it "marks mounted_at_event, lists newest first, and names the other components in a session" do
      chain = create(:component, user: user, category: "chain", label: "Chain A")
      cassette = create(:component, user: user, category: "cassette", label: "Cassette")
      create(:component_assignment, component: chain, bike: road, started_at: Time.zone.local(2026, 1, 1))
      session = create(:service_session, bike: road)
      older = event_at(chain, Time.zone.local(2026, 1, 5))
      in_session = create(:maintenance_event, component: chain, service_type: wax, performed_at: Time.zone.local(2026, 2, 1), service_session: session)
      create(:maintenance_event, component: cassette, service_type: wax, performed_at: Time.zone.local(2026, 2, 1), service_session: session)

      events = described_class.call(chain).maintenance_events

      expect(events.map { |e| e[:id] }).to eq([ in_session.id, older.id ])
      expect(events.first).to include(mounted_at_event: true, service_type_name: "Drip wax",
                                      session_components: [ { id: cassette.id, label: "Cassette" } ])
      expect(events.last[:session_components]).to eq([])
    end
  end
end
