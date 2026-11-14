require "rails_helper"

RSpec.describe "CategoryServiceRequirements", type: :request do
  let!(:current_user) { create(:user) }
  before { sign_in(current_user) }

  describe "GET /category_service_requirements" do
    it "never includes another user's templates" do
      mine = create(:category_service_requirement, user: current_user)
      create(:category_service_requirement) # another user's

      get "/category_service_requirements"

      expect(JSON.parse(response.body).map { |r| r["id"] }).to eq([ mine.id ])
    end
  end

  describe "GET /category_service_requirements/:id" do
    it "includes the requirement's own satisfiers, raw" do
      service_type = create(:service_type, user: current_user)
      requirement = create(:category_service_requirement, user: current_user, service_type: service_type, distance_meters: 500_000)

      get "/category_service_requirements/#{requirement.id}"

      body = JSON.parse(response.body)
      expect(body["name"]).to eq(requirement.name)
      expect(body["satisfiers"].size).to eq(1)
      expect(body["satisfiers"].first["service_type_id"]).to eq(service_type.id)
      expect(body["satisfiers"].first["allowance_distance_meters"]).to be_nil
    end
  end

  describe "cross-account isolation" do
    it "404s on GET for another user's template" do
      other = create(:category_service_requirement)
      get "/category_service_requirements/#{other.id}"
      expect(response).to have_http_status(:not_found)
    end

    it "404s on PATCH for another user's template" do
      other = create(:category_service_requirement)
      patch "/category_service_requirements/#{other.id}", params: { category_service_requirement: { name: "Hacked" } }
      expect(response).to have_http_status(:not_found)
      expect(other.reload.name).not_to eq("Hacked")
    end

    it "404s on DELETE for another user's template" do
      other = create(:category_service_requirement)
      delete "/category_service_requirements/#{other.id}"
      expect(response).to have_http_status(:not_found)
      expect(CategoryServiceRequirement.exists?(other.id)).to be true
    end
  end

  describe "POST /category_service_requirements" do
    it "creates a requirement with its satisfiers in one request" do
      hot_wax = create(:service_type, user: current_user, name: "Hot Wax")
      drip_wax = create(:service_type, user: current_user, name: "Drip Wax")

      post "/category_service_requirements", params: {
        category_service_requirement: { category: "chain", name: "Chain lube", distance_meters: 500_000 },
        satisfiers: [
          { service_type_id: hot_wax.id },
          { service_type_id: drip_wax.id, allowance_distance_meters: 250_000 },
        ],
      }

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body["satisfiers"].size).to eq(2)
      expect(body["satisfiers"].map { |s| s["service_type_id"] }).to eq([ hot_wax.id, drip_wax.id ])
      expect(body["satisfiers"].second["allowance_distance_meters"]).to eq(250_000)
    end

    it "rejects a create with no satisfiers, creating nothing" do
      post "/category_service_requirements", params: {
        category_service_requirement: { category: "chain", name: "Chain lube", distance_meters: 500_000 },
      }

      expect(response).to have_http_status(:unprocessable_content)
      expect(CategoryServiceRequirement.exists?(category: "chain", name: "Chain lube")).to be false
    end

    it "rolls back the whole create when one satisfier is invalid" do
      hot_wax = create(:service_type, user: current_user, name: "Hot Wax")
      other_users_service_type = create(:service_type)

      post "/category_service_requirements", params: {
        category_service_requirement: { category: "chain", name: "Chain lube", distance_meters: 500_000 },
        satisfiers: [ { service_type_id: hot_wax.id }, { service_type_id: other_users_service_type.id } ],
      }

      expect(response).to have_http_status(:unprocessable_content)
      expect(CategoryServiceRequirement.exists?(category: "chain", name: "Chain lube")).to be false
    end
  end

  describe "PATCH /category_service_requirements/:id" do
    it "updates requirement columns only, never satisfiers" do
      requirement = create(:category_service_requirement, user: current_user, distance_meters: 300_000)
      original_satisfier_id = requirement.satisfiers.first.id

      patch "/category_service_requirements/#{requirement.id}", params: {
        category_service_requirement: { distance_meters: 600_000 },
      }

      expect(response).to have_http_status(:ok)
      expect(requirement.reload.distance_meters).to eq(600_000)
      expect(requirement.satisfiers.first.id).to eq(original_satisfier_id)
    end
  end

  describe "DELETE /category_service_requirements/:id" do
    it "cascades to linked component requirements and the template's own satisfiers" do
      requirement = create(:category_service_requirement, user: current_user)
      # Component#after_create auto-links every existing template of its
      # category -- creating the component after the template already
      # produces the linked row, no separate create needed (one would
      # collide with the auto-created row's uniqueness constraint).
      component = create(:component, user: current_user, category: requirement.category)
      linked = component.component_service_requirements.find_by!(category_service_requirement: requirement)

      delete "/category_service_requirements/#{requirement.id}"

      expect(response).to have_http_status(:no_content)
      expect(ComponentServiceRequirement.exists?(linked.id)).to be false
    end
  end

  describe "POST /category_service_requirements/:id/apply" do
    it "creates a linked requirement for each given component without one yet" do
      service_type = create(:service_type, user: current_user)
      covered = create(:component, user: current_user, category: "chain")
      uncovered = create(:component, user: current_user, category: "chain")
      template = create(:category_service_requirement, user: current_user, category: "chain", service_type: service_type)
      create(:component_service_requirement, component: covered, category_service_requirement: template)

      post "/category_service_requirements/#{template.id}/apply", params: { component_ids: [ covered.id, uncovered.id ] }

      expect(response).to have_http_status(:no_content)
      expect(uncovered.component_service_requirements.where(category_service_requirement: template).count).to eq(1)
      expect(covered.component_service_requirements.where(category_service_requirement: template).count).to eq(1)
    end

    it "does not apply another user's template" do
      other_template = create(:category_service_requirement)
      component = create(:component, user: current_user, category: other_template.category)

      post "/category_service_requirements/#{other_template.id}/apply", params: { component_ids: [ component.id ] }

      expect(response).to have_http_status(:not_found)
    end
  end
end
