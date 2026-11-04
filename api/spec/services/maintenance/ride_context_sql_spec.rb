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
end
