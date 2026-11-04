require "rails_helper"

RSpec.describe Maintenance::IntervalStatus do
  def build_interval(distance_interval_meters: nil, time_interval_days: nil, baseline: Time.zone.local(2026, 1, 1))
    bike = create(:bike)
    component = create(:component, user: bike.user, category: "chain", acquired_on: baseline.to_date)
    service_type = create(:service_type, user: bike.user)
    interval = create(:component_service_interval, component: component, service_type: service_type,
      distance_interval_meters: distance_interval_meters, time_interval_days: time_interval_days)
    create(:component_assignment, component: component, bike: bike, started_at: baseline, ended_at: nil)
    [interval, bike]
  end

  describe "#call" do
    it "is ok when well under the interval" do
      interval, bike = build_interval(distance_interval_meters: 300_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 50_000)

      result = described_class.for_component(interval.component).first

      expect(result.status).to eq("ok")
      expect(result.distance_remaining_meters).to eq(250_000)
    end

    it "is due once the distance interval is reached" do
      interval, bike = build_interval(distance_interval_meters: 300_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 300_000)

      result = described_class.for_component(interval.component).first

      expect(result.status).to eq("due")
    end

    it "is warning within the default 5% threshold of the distance interval" do
      interval, bike = build_interval(distance_interval_meters: 300_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 290_000)

      result = described_class.for_component(interval.component).first

      expect(result.status).to eq("warning")
    end

    it "is due once the time interval is reached even with no distance interval" do
      interval, = build_interval(time_interval_days: 30, baseline: 31.days.ago)

      result = described_class.for_component(interval.component).first

      expect(result.status).to eq("due")
      expect(result.days_remaining).to be < 0
    end

    it "is driven by whichever dimension is further along" do
      interval, bike = build_interval(distance_interval_meters: 300_000, time_interval_days: 365, baseline: 1.day.ago)
      create(:strava_activity, bike: bike, moved_at: Time.current, distance_meters: 299_000)

      result = described_class.for_component(interval.component).first

      expect(result.status).to eq("warning")
      expect(result.driving_dimension).to eq(:distance)
    end

    it "exposes distance_used_meters, days_used, and fraction_used" do
      interval, bike = build_interval(distance_interval_meters: 300_000, baseline: Time.zone.local(2026, 1, 1))
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 150_000)

      result = described_class.for_component(interval.component).first

      expect(result.distance_used_meters).to eq(150_000)
      expect(result.days_used).to eq((Date.current - Date.new(2026, 1, 1)).to_i)
      expect(result.fraction_used).to eq(0.5)
    end

    it "uses the category's effective warning threshold, not just the hardcoded default" do
      interval, bike = build_interval(distance_interval_meters: 300_000)
      # chain is already auto-provisioned (see Users::Provision) -- override
      # its existing row rather than creating a duplicate.
      interval.component.user.component_category_settings.find_by!(category: "chain").update!(warning_threshold_percent: 50)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 200_000)

      result = described_class.for_component(interval.component).first

      expect(result.status).to eq("warning")
    end
  end

  describe "enabled-only filtering" do
    it ".for_component still includes a disabled interval, with a real computed status, so it can be re-enabled in place" do
      interval, bike = build_interval(distance_interval_meters: 300_000)
      interval.update!(enabled: false)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 300_000)

      result = described_class.for_component(interval.component).first

      expect(result.component_service_interval).to eq(interval)
      expect(result.status).to eq("due")
    end

    it ".for_user excludes a disabled interval, so it doesn't drive banners or the service_status table column" do
      interval, bike = build_interval(distance_interval_meters: 300_000)
      interval.update!(enabled: false)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 300_000)

      expect(described_class.for_user(interval.component.user)).to be_empty
      expect(described_class.worst_status_by_component(interval.component.user)).to eq({})
    end
  end

  describe ".worst_result_by_component" do
    it "picks the Result for whichever enabled interval is furthest along, keyed by component_id" do
      bike = create(:bike)
      component = create(:component, user: bike.user, category: "chain", acquired_on: Time.zone.local(2026, 1, 1))
      ok_type = create(:service_type, user: bike.user)
      due_type = create(:service_type, user: bike.user)
      ok_interval = create(:component_service_interval, component: component, service_type: ok_type,
        distance_interval_meters: 1_000_000)
      due_interval = create(:component_service_interval, component: component, service_type: due_type,
        distance_interval_meters: 1_000)
      create(:component_assignment, component: component, bike: bike,
        started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 1_000)

      results = described_class.worst_result_by_component(bike.user)

      expect(results[component.id].component_service_interval).to eq(due_interval)
      expect(results[component.id].status).to eq("due")
    end

    it "is the source worst_status_by_component now derives from (status-only projection)" do
      interval, bike = build_interval(distance_interval_meters: 300_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 300_000)

      results = described_class.worst_result_by_component(interval.component.user)
      statuses = described_class.worst_status_by_component(interval.component.user)

      expect(statuses).to eq(results.transform_values(&:status))
    end
  end

  describe "the individual sub-checks banner_eligible? composes" do
    def status_for(interval)
      described_class.for_component(interval.component).first
    end

    it "#mounted? is true when the component has an active assignment" do
      interval, = build_interval(distance_interval_meters: 300_000)

      expect(status_for(interval).mounted?).to be true
    end

    it "#mounted? is false once the assignment ends" do
      interval, = build_interval(distance_interval_meters: 300_000)
      interval.component.component_assignments.update_all(ended_at: Time.current)

      expect(status_for(interval).mounted?).to be false
    end

    it "#retired? reflects the component's retired_on" do
      interval, = build_interval(distance_interval_meters: 300_000)

      expect(status_for(interval).retired?).to be false

      interval.component.update!(retired_on: Date.current)
      expect(status_for(interval).retired?).to be true
    end

    it "#notifications_enabled? reflects the category's effective setting" do
      interval, = build_interval(distance_interval_meters: 300_000)

      expect(status_for(interval).notifications_enabled?).to be true

      interval.component.user.component_category_settings.find_by!(category: "chain").update!(notifications_enabled: false)
      expect(status_for(interval).notifications_enabled?).to be false
    end

    it "#dismissed? is public and reflects an active dismissal of the matching status" do
      interval, bike = build_interval(distance_interval_meters: 300_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 300_000)
      create(:service_alert_dismissal, component_service_interval: interval, dismissed_status: "due", dismissed_at: Time.current)

      expect(status_for(interval).dismissed?(credential: nil)).to be true
    end
  end

  describe "#banner_eligible?" do
    def status_for(interval)
      described_class.for_component(interval.component).first
    end

    it "is eligible when due, installed, not retired, and notifications enabled" do
      interval, bike = build_interval(distance_interval_meters: 300_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 300_000)

      expect(status_for(interval).banner_eligible?(credential: nil)).to be true
    end

    it "is not eligible when ok" do
      interval, bike = build_interval(distance_interval_meters: 300_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 1_000)

      expect(status_for(interval).banner_eligible?(credential: nil)).to be false
    end

    it "is not eligible when the component is not currently installed" do
      interval, bike = build_interval(distance_interval_meters: 300_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 300_000)
      interval.component.component_assignments.update_all(ended_at: Time.current)

      expect(status_for(interval).banner_eligible?(credential: nil)).to be false
    end

    it "is not eligible when the component is retired" do
      interval, bike = build_interval(distance_interval_meters: 300_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 300_000)
      interval.component.update!(retired_on: Date.current)

      expect(status_for(interval).banner_eligible?(credential: nil)).to be false
    end

    it "is not eligible when notifications are disabled for the category" do
      interval, bike = build_interval(distance_interval_meters: 300_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 300_000)
      interval.component.user.component_category_settings.find_by!(category: "chain").update!(notifications_enabled: false)

      expect(status_for(interval).banner_eligible?(credential: nil)).to be false
    end

    it "is suppressed by a matching, still-active dismissal" do
      interval, bike = build_interval(distance_interval_meters: 300_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 300_000)
      create(:service_alert_dismissal, component_service_interval: interval, dismissed_status: "due", dismissed_at: Time.current)

      expect(status_for(interval).banner_eligible?(credential: nil)).to be false
    end

    it "shows again once a sync completes after the dismissal" do
      interval, bike = build_interval(distance_interval_meters: 300_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 300_000)
      create(:service_alert_dismissal, component_service_interval: interval, dismissed_status: "due",
        dismissed_at: 1.hour.ago)
      credential = create(:strava_credential, user: interval.component.user, last_synced_at: Time.current)

      expect(status_for(interval).banner_eligible?(credential: credential)).to be true
    end

    it "shows again immediately if the dismissed status has escalated" do
      interval, bike = build_interval(distance_interval_meters: 300_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 300_000)
      create(:service_alert_dismissal, component_service_interval: interval, dismissed_status: "warning",
        dismissed_at: Time.current)

      expect(status_for(interval).banner_eligible?(credential: nil)).to be true
    end
  end
end
