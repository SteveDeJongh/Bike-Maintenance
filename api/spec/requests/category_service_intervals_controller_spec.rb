require "rails_helper"

RSpec.describe "CategoryServiceIntervals", type: :request do
  let!(:current_user) { create(:user) }
  before { sign_in(current_user) }

  describe "GET /category_service_requirements" do
    it "never includes another user's templates" do
      mine = create(:category_service_requirement, user: current_user)
      create(:category_service_requirement) # another user's

      get "/category_service_intervals"

      expect(JSON.parse(response.body).map { |i| i["id"] }).to eq([mine.id])
    end
  end

  describe "cross-account isolation" do
    it "404s on GET /category_service_requirements/:id for another user's template" do
      other_template = create(:category_service_requirement)

      get "/category_service_intervals/#{other_template.id}"

      expect(response).to have_http_status(:not_found)
    end

    it "404s on DELETE /category_service_requirements/:id for another user's template" do
      other_template = create(:category_service_requirement)

      delete "/category_service_intervals/#{other_template.id}"

      expect(response).to have_http_status(:not_found)
      expect(CategoryServiceRequirement.exists?(other_template.id)).to be true
    end
  end

  describe "POST /category_service_requirements" do
    it "does not create with another user's service_type_id" do
      other_service_type = create(:service_type)

      post "/category_service_intervals", params: {
        category_service_interval: { category: "chain", service_type_id: other_service_type.id, distance_interval_meters: 300_000 },
      }

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "PATCH /category_service_requirements/:id" do
    it "does not update to reference another user's service_type_id" do
      service_type = current_user.service_types.find_by!(name: "wax")
      interval = create(:category_service_requirement, user: current_user, category: "chain", service_type: service_type)
      other_service_type = create(:service_type)

      patch "/category_service_intervals/#{interval.id}", params: {
        category_service_interval: { service_type_id: other_service_type.id },
      }

      expect(response).to have_http_status(:not_found)
      expect(interval.reload.satisfiers.first.service_type_id).to eq(service_type.id)
    end
  end

  describe "POST /category_service_requirements/:id/apply" do
    it "creates a linked requirement for each given component without one yet" do
      service_type = create(:service_type, user: current_user)
      covered = create(:component, user: current_user, category: "chain")
      uncovered = create(:component, user: current_user, category: "chain")
      template = create(:category_service_requirement, user: current_user, category: "chain", service_type: service_type)
      # "Already represented" is per linked template now, not per service
      # type -- covered already has a linked row for this exact template.
      create(:component_service_requirement, component: covered, category_service_requirement: template)

      post "/category_service_intervals/#{template.id}/apply", params: { component_ids: [ covered.id, uncovered.id ] }

      expect(response).to have_http_status(:no_content)
      expect(uncovered.component_service_requirements.where(category_service_requirement: template).count).to eq(1)
      expect(covered.component_service_requirements.where(category_service_requirement: template).count).to eq(1)
    end

    it "ignores a component from a different category" do
      service_type = create(:service_type, user: current_user)
      template = create(:category_service_requirement, user: current_user, category: "chain", service_type: service_type)
      other_category_component = create(:component, user: current_user, category: "cassette")

      post "/category_service_intervals/#{template.id}/apply", params: { component_ids: [ other_category_component.id ] }

      expect(response).to have_http_status(:no_content)
      expect(other_category_component.component_service_requirements).to be_empty
    end

    it "does not apply another user's template" do
      other_template = create(:category_service_requirement)
      component = create(:component, user: current_user, category: other_template.category)

      post "/category_service_intervals/#{other_template.id}/apply", params: { component_ids: [ component.id ] }

      expect(response).to have_http_status(:not_found)
    end
  end
end
