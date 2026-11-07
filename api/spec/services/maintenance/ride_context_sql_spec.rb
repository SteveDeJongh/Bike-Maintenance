require "rails_helper"

RSpec.describe Maintenance::RideContextSql, type: :model do
  describe ".predicate" do
    it "builds the ride_context predicate using the given table aliases" do
      sql = described_class.predicate(assignment_alias: "ca", activity_alias: "sa")

      expect(sql).to include("ca.ride_context = 'both'")
      expect(sql).to include("ca.ride_context = 'outdoor_only' AND sa.trainer = false AND sa.activity_type IS DISTINCT FROM 'VirtualRide'")
      expect(sql).to include("ca.ride_context = 'indoor_only' AND (sa.trainer = true OR sa.activity_type = 'VirtualRide')")
    end

    it "works with different table aliases, for a second query joining the same two tables under different names" do
      sql = described_class.predicate(assignment_alias: "assignments", activity_alias: "activities")

      expect(sql).to include("assignments.ride_context = 'both'")
      expect(sql).to include("activities.trainer = false")
    end
  end

  describe ".outdoor_predicate / .indoor_predicate" do
    it "matches StravaActivity.outdoor/.indoor on a mixed fixture set" do
      outdoor = create(:strava_activity, trainer: false, activity_type: "Ride")
      trainer = create(:strava_activity, trainer: true, activity_type: "Ride")
      virtual = create(:strava_activity, trainer: false, activity_type: "VirtualRide")

      outdoor_ids = StravaActivity.where(
        "#{described_class.outdoor_predicate(activity_alias: 'strava_activities')}",
      ).pluck(:id)
      indoor_ids = StravaActivity.where(
        "#{described_class.indoor_predicate(activity_alias: 'strava_activities')}",
      ).pluck(:id)

      expect(outdoor_ids).to match_array(StravaActivity.outdoor.pluck(:id))
      expect(indoor_ids).to match_array(StravaActivity.indoor.pluck(:id))
      expect(outdoor_ids).to contain_exactly(outdoor.id)
      expect(indoor_ids).to contain_exactly(trainer.id, virtual.id)
    end
  end
end
