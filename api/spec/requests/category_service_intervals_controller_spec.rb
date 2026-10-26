require "rails_helper"

RSpec.describe "CategoryServiceIntervals", type: :request do
  let!(:current_user) { create(:user) }

  describe "POST /category_service_intervals/:id/apply" do
    it "creates a linked interval for each given component not already covered" do
      service_type = create(:service_type, user: current_user)
      # Components created before the template exists -- Component's
      # after_create auto-apply has nothing to attach yet, matching "adding
      # a template never retroactively attaches."
      covered = create(:component, user: current_user, category: "chain")
      uncovered = create(:component, user: current_user, category: "chain")
      create(:component_service_interval, component: covered, service_type: service_type, distance_interval_meters: 50_000)

      template = create(:category_service_interval, user: current_user, category: "chain", service_type: service_type)

      post "/category_service_intervals/#{template.id}/apply", params: { component_ids: [ covered.id, uncovered.id ] }

      expect(response).to have_http_status(:no_content)
      expect(uncovered.component_service_intervals.find_by(service_type: service_type)).to be_present
      expect(covered.component_service_intervals.find_by(service_type: service_type).distance_interval_meters).to eq(50_000)
    end

    it "ignores a component from a different category" do
      service_type = create(:service_type, user: current_user)
      template = create(:category_service_interval, user: current_user, category: "chain", service_type: service_type)
      other_category_component = create(:component, user: current_user, category: "cassette")

      post "/category_service_intervals/#{template.id}/apply", params: { component_ids: [ other_category_component.id ] }

      expect(response).to have_http_status(:no_content)
      expect(other_category_component.component_service_intervals).to be_empty
    end

    it "does not apply another user's template" do
      other_template = create(:category_service_interval)
      component = create(:component, user: current_user, category: other_template.category)

      post "/category_service_intervals/#{other_template.id}/apply", params: { component_ids: [ component.id ] }

      expect(response).to have_http_status(:not_found)
    end
  end
end
