require "rails_helper"

RSpec.describe "ServiceRequirementSatisfiers", type: :request do
  let!(:current_user) { create(:user) }
  before { sign_in(current_user) }

  describe "POST /category_service_requirements/:id/satisfiers" do
    it "appends a satisfier at the next position" do
      requirement = create(:category_service_requirement, user: current_user, distance_meters: 500_000)
      service_type = create(:service_type, user: current_user)

      post "/category_service_requirements/#{requirement.id}/satisfiers",
        params: { service_type_id: service_type.id, allowance_distance_meters: 250_000 }

      expect(response).to have_http_status(:created)
      expect(requirement.satisfiers.order(:position).pluck(:position)).to eq([ 1, 2 ])
    end

    it "does not allow a satisfier on another user's template" do
      other_template = create(:category_service_requirement)
      service_type = create(:service_type, user: current_user)

      post "/category_service_requirements/#{other_template.id}/satisfiers", params: { service_type_id: service_type.id }

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /component_service_requirements/:id/satisfiers" do
    it "rejects adding a satisfier to a linked row" do
      template = create(:category_service_requirement, user: current_user)
      # Component#after_create auto-links every existing template of its
      # category, so creating the component after the template already
      # produces the linked row.
      component = create(:component, user: current_user, category: template.category)
      linked = component.component_service_requirements.find_by!(category_service_requirement: template)
      service_type = create(:service_type, user: current_user)

      post "/component_service_requirements/#{linked.id}/satisfiers", params: { service_type_id: service_type.id }

      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["base"].first).to match(/template's satisfiers/)
    end

    it "appends a satisfier to a custom row" do
      component = create(:component, user: current_user)
      requirement = create(:component_service_requirement, component: component, distance_meters: 500_000)
      service_type = create(:service_type, user: current_user)

      post "/component_service_requirements/#{requirement.id}/satisfiers", params: { service_type_id: service_type.id }

      expect(response).to have_http_status(:created)
      expect(requirement.reload.satisfiers.count).to eq(2)
    end
  end

  describe "PATCH /service_requirement_satisfiers/:id" do
    it "updates allowance overrides" do
      requirement = create(:category_service_requirement, user: current_user, distance_meters: 500_000)
      satisfier = requirement.satisfiers.first

      patch "/service_requirement_satisfiers/#{satisfier.id}", params: { allowance_distance_meters: 250_000 }

      expect(response).to have_http_status(:ok)
      expect(satisfier.reload.allowance_distance_meters).to eq(250_000)
    end

    it "404s for another user's satisfier" do
      other = create(:service_requirement_satisfier)

      patch "/service_requirement_satisfiers/#{other.id}", params: { allowance_distance_meters: 250_000 }

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "DELETE /service_requirement_satisfiers/:id" do
    it "removes a satisfier that isn't the last one" do
      requirement = create(:category_service_requirement, user: current_user)
      extra = create(:service_requirement_satisfier, owner: requirement, service_type: create(:service_type, user: current_user), position: 2)

      delete "/service_requirement_satisfiers/#{extra.id}"

      expect(response).to have_http_status(:no_content)
      expect(ServiceRequirementSatisfier.exists?(extra.id)).to be false
    end

    it "blocks removing the owner's last satisfier" do
      requirement = create(:category_service_requirement, user: current_user)
      only_satisfier = requirement.satisfiers.first

      delete "/service_requirement_satisfiers/#{only_satisfier.id}"

      expect(response).to have_http_status(:unprocessable_content)
      expect(ServiceRequirementSatisfier.exists?(only_satisfier.id)).to be true
    end

    it "404s for another user's satisfier" do
      other = create(:service_requirement_satisfier)

      delete "/service_requirement_satisfiers/#{other.id}"

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "PATCH .../satisfiers/reorder" do
    it "reorders to exactly the given order" do
      requirement = create(:category_service_requirement, user: current_user)
      first = requirement.satisfiers.first
      second = create(:service_requirement_satisfier, owner: requirement, service_type: create(:service_type, user: current_user), position: 2)

      patch "/category_service_requirements/#{requirement.id}/satisfiers/reorder",
        params: { satisfier_ids: [ second.id, first.id ] }

      expect(response).to have_http_status(:ok)
      expect(requirement.satisfiers.order(:position).pluck(:id)).to eq([ second.id, first.id ])
    end

    it "rejects a list that doesn't match the current satisfiers exactly" do
      requirement = create(:category_service_requirement, user: current_user)
      first = requirement.satisfiers.first

      patch "/category_service_requirements/#{requirement.id}/satisfiers/reorder",
        params: { satisfier_ids: [ first.id, 999_999 ] }

      expect(response).to have_http_status(:unprocessable_content)
    end
  end
end
