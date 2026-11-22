require "rails_helper"

RSpec.describe Components::Retire do
  let(:user) { create(:user) }
  let(:bike) { create(:bike, user: user, name: "Juan Solo") }
  let(:vancouver) { ActiveSupport::TimeZone["America/Vancouver"] }
  let(:installed_at) { Time.zone.local(2026, 1, 1, 8, 0) }
  let(:at) { Time.zone.local(2026, 3, 1, 15, 0) }

  def chain(label, **attrs)
    create(:component, user: user, category: "chain", label: label, **attrs)
  end

  def install(component, on: bike, from: installed_at, to: nil, ride_context: "both")
    create(:component_assignment, component: component, bike: on, started_at: from, ended_at: to, ride_context: ride_context)
  end

  before { travel_to Time.zone.local(2026, 3, 10, 12, 0) }
  after { travel_back }

  it "retires an unmounted component without touching its history" do
    component = chain("Chain A")
    past = install(component, to: Time.zone.local(2026, 2, 1))

    result = described_class.call(component: component, at: at, zone: vancouver)

    expect(result).to be_success
    expect(component.reload.retired_on).to eq(Date.new(2026, 3, 1))
    expect(past.reload.ended_at).to eq(Time.zone.local(2026, 2, 1))
    expect(result.ended_assignments).to eq([])
  end

  it "ends a mounted component's assignment at `at`" do
    component = chain("Chain A")
    assignment = install(component)

    result = described_class.call(component: component, at: at, zone: vancouver)

    expect(result).to be_success
    expect(assignment.reload.ended_at).to eq(at)
    expect(result.ended_assignments).to eq([ assignment ])
    expect(result.new_assignment).to be_nil
  end

  it "sets retired_on to the local date in the viewer's zone, not UTC's" do
    component = chain("Chain A")
    install(component)
    late_evening = vancouver.local(2026, 3, 1, 22, 30) # 06:30 UTC on March 2

    described_class.call(component: component, at: late_evening, zone: vancouver)

    expect(component.reload.retired_on).to eq(Date.new(2026, 3, 1))
  end

  it "retires and replaces at the same instant, keeping the slot's ride_context" do
    old_tire = create(:component, user: user, category: "tire_front", label: "Old tire")
    new_tire = create(:component, user: user, category: "tire_front", label: "New tire")
    old_assignment = install(old_tire, ride_context: "outdoor_only")

    result = described_class.call(component: old_tire, at: at, zone: vancouver, replacement: new_tire)

    expect(result).to be_success
    expect(old_assignment.reload.ended_at).to eq(at)
    expect(result.new_assignment).to have_attributes(
      component_id: new_tire.id, bike_id: bike.id, started_at: at, ended_at: nil, ride_context: "outdoor_only",
    )
    expect(old_tire.reload.retired_on).to eq(Date.new(2026, 3, 1))
  end

  it "credits rides after `at` to the replacement, not the retired component" do
    chain_a = chain("Chain A")
    chain_b = chain("Chain B")
    install(chain_a)
    create(:strava_activity, user: user, bike: bike, moved_at: at - 1.hour, distance_meters: 1_000)
    create(:strava_activity, user: user, bike: bike, moved_at: at + 1.hour, distance_meters: 5_000)

    described_class.call(component: chain_a, at: at, zone: vancouver, replacement: chain_b)

    expect(chain_a.reload.total_distance).to eq(1_000)
    expect(chain_b.reload.total_distance).to eq(5_000)
  end

  describe "a component on more than one bike (shared indoor_only cassette)" do
    let(:trainer) { create(:bike, user: user, name: "Trainer") }
    let(:cassette) { create(:component, user: user, category: "cassette", label: "Trainer cassette") }
    let!(:on_bike) { install(cassette, ride_context: "indoor_only") }
    let!(:on_trainer) { install(cassette, on: trainer, ride_context: "indoor_only") }

    it "ends every active assignment" do
      result = described_class.call(component: cassette, at: at, zone: vancouver)

      expect(result).to be_success
      expect([ on_bike.reload.ended_at, on_trainer.reload.ended_at ]).to eq([ at, at ])
    end

    it "rejects a replacement" do
      other = create(:component, user: user, category: "cassette", label: "Spare")

      result = described_class.call(component: cassette, at: at, zone: vancouver, replacement: other)

      expect(result).not_to be_success
      expect(result.errors[:base].first).to include("more than one bike")
      expect(on_bike.reload.ended_at).to be_nil
      expect(cassette.reload.retired_on).to be_nil
    end
  end

  describe "invalid requests change nothing" do
    let(:component) { chain("Chain A") }
    let!(:assignment) { install(component) }

    def expect_rejected(result, message)
      expect(result).not_to be_success
      expect(Array(result.errors[:base]).join(" ")).to include(message)
      expect(assignment.reload.ended_at).to be_nil
      expect(component.reload.retired_on).to be_nil
    end

    it "rejects `at` in the future" do
      expect_rejected(described_class.call(component: component, at: 1.day.from_now, zone: vancouver), "future")
    end

    it "rejects `at` at or before the installation's start" do
      expect_rejected(described_class.call(component: component, at: installed_at, zone: vancouver), "must be after its installation")
    end

    it "rejects a blank `at`" do
      expect_rejected(described_class.call(component: component, at: nil, zone: vancouver), "required")
    end

    it "rejects an already retired component" do
      component.update!(retired_on: Date.new(2026, 2, 1))
      result = described_class.call(component: component, at: at, zone: vancouver)
      expect(result.errors[:base]).to include("Chain A is already retired.")
    end

    it "rejects a replacement in another category" do
      saddle = create(:component, user: user, category: "saddle", label: "Saddle")
      expect_rejected(described_class.call(component: component, at: at, zone: vancouver, replacement: saddle), "same category")
    end

    it "rejects a retired replacement" do
      spare = chain("Spare", retired_on: Date.new(2026, 1, 1))
      expect_rejected(described_class.call(component: component, at: at, zone: vancouver, replacement: spare), "retired")
    end

    it "rejects replacing a component with itself" do
      expect_rejected(described_class.call(component: component, at: at, zone: vancouver, replacement: component), "itself")
    end

    it "rolls back the ended assignment when the replacement can't be installed" do
      # The spare is already mounted on another bike over `at`, so Swap ends
      # the old assignment and then fails to save the new one.
      other_bike = create(:bike, user: user, name: "Other")
      spare = chain("Spare")
      install(spare, on: other_bike)

      expect_rejected(described_class.call(component: component, at: at, zone: vancouver, replacement: spare), "")
    end
  end

  it "rejects retiring an unmounted component before its last removal" do
    component = chain("Chain A")
    install(component, to: Time.zone.local(2026, 2, 1))

    result = described_class.call(component: component, at: Time.zone.local(2026, 1, 15), zone: vancouver)

    expect(result).not_to be_success
    expect(result.errors[:base].first).to include("last removed")
    expect(component.reload.retired_on).to be_nil
  end
end
