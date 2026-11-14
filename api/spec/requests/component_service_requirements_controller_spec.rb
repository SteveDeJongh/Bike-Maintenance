require "rails_helper"

RSpec.describe "ComponentServiceRequirements", type: :request do
  let!(:current_user) { create(:user) }
  before { sign_in(current_user) }

  describe "GET /component_service_requirements?component_id=" do
    it "scopes to the given component and never includes another user's rows" do
      component = create(:component, user: current_user)
      mine = create(:component_service_requirement, component: component)
      create(:component_service_requirement) # another user's

      get "/component_service_requirements", params: { component_id: component.id }

      expect(JSON.parse(response.body).map { |r| r["id"] }).to eq([ mine.id ])
    end
  end

  describe "GET /component_service_requirements/:id" do
    it "a linked row's satisfiers/effective come from its template" do
      hot_wax = create(:service_type, user: current_user, name: "Hot Wax")
      template = create(:category_service_requirement, user: current_user, service_type: hot_wax, distance_meters: 400_000)
      # Component#after_create auto-links every existing template of its
      # category, so creating the component after the template already
      # produces the linked row we want to inspect.
      component = create(:component, user: current_user, category: template.category)
      linked = component.component_service_requirements.find_by!(category_service_requirement: template)

      get "/component_service_requirements/#{linked.id}"

      body = JSON.parse(response.body)
      expect(body["name"]).to be_nil
      expect(body["satisfiers"].first["service_type_id"]).to eq(hot_wax.id)
      expect(body["effective"]["name"]).to eq(template.name)
      expect(body["effective"]["distance_meters"]).to eq(400_000)
    end
  end

  describe "cross-account isolation" do
    it "404s on GET for another user's row" do
      other = create(:component_service_requirement)
      get "/component_service_requirements/#{other.id}"
      expect(response).to have_http_status(:not_found)
    end

    it "404s on PATCH for another user's row" do
      other = create(:component_service_requirement)
      patch "/component_service_requirements/#{other.id}", params: { component_service_requirement: { enabled: false } }
      expect(response).to have_http_status(:not_found)
      expect(other.reload.enabled).to be true
    end

    it "404s on DELETE for another user's row" do
      other = create(:component_service_requirement)
      delete "/component_service_requirements/#{other.id}"
      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /component_service_requirements" do
    it "creates a custom requirement with its satisfiers in one request" do
      component = create(:component, user: current_user)
      service_type = create(:service_type, user: current_user)

      post "/component_service_requirements", params: {
        component_service_requirement: { component_id: component.id, name: "Custom", distance_meters: 100_000 },
        satisfiers: [ { service_type_id: service_type.id } ],
      }

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body["satisfiers"].size).to eq(1)
    end

    it "rejects a custom create with no satisfiers" do
      component = create(:component, user: current_user)

      post "/component_service_requirements", params: {
        component_service_requirement: { component_id: component.id, name: "Custom", distance_meters: 100_000 },
      }

      expect(response).to have_http_status(:unprocessable_content)
      expect(ComponentServiceRequirement.exists?(component: component, name: "Custom")).to be false
    end

    it "creates a linked requirement with no satisfiers of its own" do
      # Component created before the template, so Component#after_create's
      # auto-linking doesn't already create the row this test posts for.
      component = create(:component, user: current_user, category: "chain")
      template = create(:category_service_requirement, user: current_user, category: "chain")

      post "/component_service_requirements", params: {
        component_service_requirement: { component_id: component.id, category_service_requirement_id: template.id },
      }

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body["satisfiers"].map { |s| s["service_type_id"] }).to eq(template.satisfiers.map(&:service_type_id))
    end

    it "rejects satisfiers sent alongside a linked create" do
      template = create(:category_service_requirement, user: current_user)
      component = create(:component, user: current_user, category: template.category)
      service_type = create(:service_type, user: current_user)

      post "/component_service_requirements", params: {
        component_service_requirement: { component_id: component.id, category_service_requirement_id: template.id },
        satisfiers: [ { service_type_id: service_type.id } ],
      }

      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["base"].first).to match(/template's satisfiers/)
    end
  end

  describe "PATCH /component_service_requirements/:id" do
    it "updates enable/overrides but not category_service_requirement_id or component_id" do
      component = create(:component, user: current_user)
      requirement = create(:component_service_requirement, component: component, enabled: true, distance_meters: 300_000)
      other_component = create(:component, user: current_user)

      patch "/component_service_requirements/#{requirement.id}", params: {
        component_service_requirement: { enabled: false, distance_meters: 600_000, component_id: other_component.id },
      }

      expect(response).to have_http_status(:ok)
      requirement.reload
      expect(requirement.enabled).to be false
      expect(requirement.distance_meters).to eq(600_000)
      expect(requirement.component_id).to eq(component.id)
    end
  end

  describe "DELETE /component_service_requirements/:id" do
    it "removes the row and its own satisfiers (custom, lone satisfier)" do
      component = create(:component, user: current_user)
      requirement = create(:component_service_requirement, component: component)

      delete "/component_service_requirements/#{requirement.id}"

      expect(response).to have_http_status(:no_content)
      expect(ComponentServiceRequirement.exists?(requirement.id)).to be false
    end
  end

  describe "POST /component_service_requirements/apply_defaults" do
    it "creates a linked requirement for each given template not already represented" do
      component = create(:component, user: current_user, category: "chain")
      template1 = create(:category_service_requirement, user: current_user, category: "chain")
      template2 = create(:category_service_requirement, user: current_user, category: "chain")
      create(:component_service_requirement, component: component, category_service_requirement: template1)

      post "/component_service_requirements/apply_defaults", params: {
        component_id: component.id, category_service_requirement_ids: [ template1.id, template2.id ],
      }

      expect(response).to have_http_status(:ok)
      expect(component.component_service_requirements.where(category_service_requirement: template1).count).to eq(1)
      expect(component.component_service_requirements.where(category_service_requirement: template2).count).to eq(1)
    end
  end
end
