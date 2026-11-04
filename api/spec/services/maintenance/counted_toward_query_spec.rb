require "rails_helper"

RSpec.describe Maintenance::CountedTowardQuery do
  describe ".call" do
    it "matches ComponentAssignment#activities_from's ride_context filtering, including a split indoor/outdoor cassette slot" do
      user = create(:user)
      bike = create(:bike, user: user)
      ComponentCategorySetting.find_or_initialize_by(user: user, category: "cassette")
        .update!(allows_multiple_assignments: true)
      create(:bike_component_slot, bike: bike, category: "cassette", ride_context: "outdoor_only")
      create(:bike_component_slot, bike: bike, category: "cassette", ride_context: "indoor_only")

      outdoor_cassette = create(:component, user: user, category: "cassette", label: "Road cassette")
      indoor_cassette = create(:component, user: user, category: "cassette", label: "Trainer cassette")

      start = 10.days.ago
      outdoor_assignment = create(:component_assignment,
        component: outdoor_cassette, bike: bike, ride_context: "outdoor_only", started_at: start)
      indoor_assignment = create(:component_assignment,
        component: indoor_cassette, bike: bike, ride_context: "indoor_only", started_at: start)

      outdoor_ride = create(:strava_activity, user: user, bike: bike, moved_at: 5.days.ago, trainer: false, activity_type: "Ride")
      trainer_ride = create(:strava_activity, user: user, bike: bike, moved_at: 4.days.ago, trainer: true, activity_type: "Ride")
      virtual_ride = create(:strava_activity, user: user, bike: bike, moved_at: 3.days.ago, trainer: false, activity_type: "VirtualRide")
      # Outside the window -- must not appear in the result at all.
      create(:strava_activity, user: user, bike: bike, moved_at: 20.days.ago, trainer: false, activity_type: "Ride")

      result = described_class.call(user, since: 14.days.ago)

      expect(result[outdoor_ride.id]).to contain_exactly({ component_id: outdoor_cassette.id, label: "Road cassette" })
      expect(result[trainer_ride.id]).to contain_exactly({ component_id: indoor_cassette.id, label: "Trainer cassette" })
      expect(result[virtual_ride.id]).to contain_exactly({ component_id: indoor_cassette.id, label: "Trainer cassette" })

      [outdoor_assignment, indoor_assignment].each do |assignment|
        expected_ride_ids = assignment.activities_from(assignment.started_at).pluck(:id)
        actual_ride_ids = result.select { |_ride_id, components| components.any? { |c| c[:component_id] == assignment.component_id } }.keys
        expect(actual_ride_ids.sort).to eq(expected_ride_ids.sort)
      end
    end

    it "omits activities with no bike or no matching assignment" do
      user = create(:user)
      bike = create(:bike, user: user)
      create(:strava_activity, user: user, bike: nil, moved_at: 1.day.ago)
      unmatched_bike_ride = create(:strava_activity, user: user, bike: bike, moved_at: 1.day.ago)

      result = described_class.call(user, since: 14.days.ago)

      expect(result).not_to have_key(unmatched_bike_ride.id)
    end
  end
end
