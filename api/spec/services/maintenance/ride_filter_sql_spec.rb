require "rails_helper"

RSpec.describe Maintenance::RideFilterSql do
  describe ".predicate" do
    def matches?(ride_filter:, trainer:, activity_type: "Ride")
      bike = create(:bike)
      activity = create(:strava_activity, bike: bike, trainer: trainer, activity_type: activity_type)

      sql = <<~SQL
        SELECT #{described_class.predicate(requirement_alias: "cp", activity_alias: "sa")} AS matched
        FROM strava_activities sa, (VALUES (#{ActiveRecord::Base.connection.quote(ride_filter)})) AS cp(ride_filter)
        WHERE sa.id = #{activity.id}
      SQL

      ActiveRecord::Base.connection.exec_query(sql).first["matched"]
    end

    it "matches everything when ride_filter is all, regardless of indoor/outdoor" do
      expect(matches?(ride_filter: "all", trainer: false)).to be_truthy
      expect(matches?(ride_filter: "all", trainer: true)).to be_truthy
    end

    it "matches only outdoor rides when ride_filter is outdoor" do
      expect(matches?(ride_filter: "outdoor", trainer: false)).to be_truthy
      expect(matches?(ride_filter: "outdoor", trainer: true)).to be_falsy
      expect(matches?(ride_filter: "outdoor", trainer: false, activity_type: "VirtualRide")).to be_falsy
    end

    it "matches only indoor rides (trainer or virtual) when ride_filter is indoor" do
      expect(matches?(ride_filter: "indoor", trainer: true)).to be_truthy
      expect(matches?(ride_filter: "indoor", trainer: false, activity_type: "VirtualRide")).to be_truthy
      expect(matches?(ride_filter: "indoor", trainer: false)).to be_falsy
    end
  end
end
