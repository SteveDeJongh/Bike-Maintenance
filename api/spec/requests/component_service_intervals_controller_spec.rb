require "rails_helper"

RSpec.describe "ComponentServiceIntervals", type: :request do
  let!(:current_user) { create(:user) }

  describe "POST /component_service_intervals" do
    it "derives service_type_id from the template when linking, without it being sent explicitly" do
      component = create(:component, user: current_user, category: "chain")
      template = create(:category_service_interval, user: current_user, category: "chain")

      post "/component_service_intervals", params: {
        component_service_interval: { component_id: component.id, category_service_interval_id: template.id },
      }

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body["service_type_id"]).to eq(template.service_type_id)
    end
  end

  describe "POST /component_service_intervals/apply_defaults" do
    it "creates a linked interval for each given template not already represented" do
      component = create(:component, user: current_user, category: "chain")
      template_a = create(:category_service_interval, user: current_user, category: "chain",
        service_type: create(:service_type, user: current_user))
      template_b = create(:category_service_interval, user: current_user, category: "chain",
        service_type: create(:service_type, user: current_user))

      post "/component_service_intervals/apply_defaults", params: {
        component_id: component.id, category_service_interval_ids: [ template_a.id, template_b.id ],
      }

      expect(response).to have_http_status(:ok)
      expect(component.component_service_intervals.count).to eq(2)
    end

    it "skips a template whose service type the component already has an interval for" do
      service_type = create(:service_type, user: current_user)
      component = create(:component, user: current_user, category: "chain")
      create(:component_service_interval, component: component, service_type: service_type, distance_interval_meters: 12_345)
      template = create(:category_service_interval, user: current_user, category: "chain", service_type: service_type)

      post "/component_service_intervals/apply_defaults", params: {
        component_id: component.id, category_service_interval_ids: [ template.id ],
      }

      expect(response).to have_http_status(:ok)
      expect(component.component_service_intervals.count).to eq(1)
      expect(component.component_service_intervals.first.distance_interval_meters).to eq(12_345)
    end
  end

  describe "DELETE /component_service_intervals/:id" do
    it "removes the interval outright, not just disabling it" do
      interval = create(:component_service_interval, component: create(:component, user: current_user))

      delete "/component_service_intervals/#{interval.id}"

      expect(response).to have_http_status(:no_content)
      expect(ComponentServiceInterval.exists?(interval.id)).to be false
    end

    it "does not allow deleting another user's interval" do
      other_interval = create(:component_service_interval)

      delete "/component_service_intervals/#{other_interval.id}"

      expect(response).to have_http_status(:not_found)
      expect(ComponentServiceInterval.exists?(other_interval.id)).to be true
    end
  end
end
