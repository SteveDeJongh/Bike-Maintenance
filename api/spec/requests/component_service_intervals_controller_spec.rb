require "rails_helper"

RSpec.describe "ComponentServiceIntervals", type: :request do
  let!(:current_user) { create(:user) }
  before { sign_in(current_user) }

  describe "GET /component_service_requirements" do
    it "never includes another user's intervals" do
      mine = create(:component_service_requirement, component: create(:component, user: current_user))
      create(:component_service_requirement) # another user's

      get "/component_service_intervals"

      expect(JSON.parse(response.body).map { |i| i["id"] }).to eq([mine.id])
    end
  end

  describe "GET /component_service_requirements/:id" do
    it "404s for another user's interval" do
      other_interval = create(:component_service_requirement)

      get "/component_service_intervals/#{other_interval.id}"

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /component_service_requirements" do
    it "derives service_type_id from the template when linking, without it being sent explicitly" do
      component = create(:component, user: current_user, category: "chain")
      template = create(:category_service_requirement, user: current_user, category: "chain")

      post "/component_service_intervals", params: {
        component_service_interval: { component_id: component.id, category_service_interval_id: template.id },
      }

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body["service_type_id"]).to eq(template.satisfiers.first.service_type_id)
    end

    it "does not create with another user's service_type_id, even alongside a valid category_service_interval_id" do
      component = create(:component, user: current_user, category: "chain")
      template = create(:category_service_requirement, user: current_user, category: "chain")
      other_service_type = create(:service_type)

      post "/component_service_intervals", params: {
        component_service_interval: {
          component_id: component.id, category_service_interval_id: template.id, service_type_id: other_service_type.id,
        },
      }

      expect(response).to have_http_status(:not_found)
    end

    it "does not create with another user's category_service_interval_id" do
      component = create(:component, user: current_user, category: "chain")
      other_template = create(:category_service_requirement)

      post "/component_service_intervals", params: {
        component_service_interval: { component_id: component.id, category_service_interval_id: other_template.id },
      }

      expect(response).to have_http_status(:not_found)
    end

    it "creates a custom interval when category_service_interval_id is sent explicitly as null" do
      component = create(:component, user: current_user, category: "chain")
      service_type = create(:service_type, user: current_user, name: "Lube")

      post "/component_service_intervals", params: {
        component_service_interval: {
          component_id: component.id, category_service_interval_id: nil,
          service_type_id: service_type.id, distance_interval_meters: 300_000,
        },
      }.to_json, headers: { "Content-Type" => "application/json" }

      expect(response).to have_http_status(:created)
      expect(component.component_service_requirements.last.category_service_requirement_id).to be_nil
    end
  end

  describe "POST /component_service_requirements/apply_defaults" do
    it "creates a linked requirement for each given template not already represented" do
      component = create(:component, user: current_user, category: "chain")
      template_a = create(:category_service_requirement, user: current_user, category: "chain",
        service_type: create(:service_type, user: current_user))
      template_b = create(:category_service_requirement, user: current_user, category: "chain",
        service_type: create(:service_type, user: current_user))

      post "/component_service_intervals/apply_defaults", params: {
        component_id: component.id, category_service_interval_ids: [ template_a.id, template_b.id ],
      }

      expect(response).to have_http_status(:ok)
      expect(component.component_service_requirements.count).to eq(2)
    end

    it "skips a template the component already has a linked requirement for" do
      # "Already represented" is per linked template now, not per service
      # type -- a custom requirement that happens to share a service type
      # with the template no longer blocks the template from being added.
      component = create(:component, user: current_user, category: "chain")
      create(:component_service_requirement, component: component, distance_interval_meters: 12_345)
      template = create(:category_service_requirement, user: current_user, category: "chain")
      create(:component_service_requirement, component: component, category_service_requirement: template)

      post "/component_service_intervals/apply_defaults", params: {
        component_id: component.id, category_service_interval_ids: [ template.id ],
      }

      expect(response).to have_http_status(:ok)
      expect(component.component_service_requirements.where(category_service_requirement: template).count).to eq(1)
      expect(component.component_service_requirements.count).to eq(2)
    end
  end

  describe "DELETE /component_service_requirements/:id" do
    it "removes the interval outright, not just disabling it" do
      interval = create(:component_service_requirement, component: create(:component, user: current_user))

      delete "/component_service_intervals/#{interval.id}"

      expect(response).to have_http_status(:no_content)
      expect(ComponentServiceRequirement.exists?(interval.id)).to be false
    end

    it "does not allow deleting another user's interval" do
      other_interval = create(:component_service_requirement)

      delete "/component_service_intervals/#{other_interval.id}"

      expect(response).to have_http_status(:not_found)
      expect(ComponentServiceRequirement.exists?(other_interval.id)).to be true
    end
  end
end
