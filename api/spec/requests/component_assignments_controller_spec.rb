require "rails_helper"

# This controller is otherwise plain CRUD (covered by ComponentAssignment's own
# model specs), but ride_context being silently dropped from strong params is
# exactly the kind of bug a model spec can never catch -- caught once already
# (POST with ride_context: "outdoor_only" silently saved as "both"), so it gets
# a narrow regression spec here rather than a full request-spec suite.
RSpec.describe "ComponentAssignments", type: :request do
  let!(:current_user) { create(:user) }
  before { sign_in(current_user) }

  it "persists ride_context on create" do
    bike = create(:bike, user: current_user)
    component = create(:component, user: current_user, category: "cassette")

    post "/component_assignments", params: {
      component_assignment: {
        component_id: component.id, bike_id: bike.id,
        started_at: "2026-01-01T00:00:00Z", ride_context: "outdoor_only",
      },
    }

    expect(response).to have_http_status(:created)
    expect(JSON.parse(response.body)["ride_context"]).to eq("outdoor_only")
  end

  it "persists ride_context on update" do
    assignment = create(:component_assignment, bike: create(:bike, user: current_user),
      component: create(:component, user: current_user))

    patch "/component_assignments/#{assignment.id}", params: {
      component_assignment: { ride_context: "indoor_only" },
    }

    expect(response).to have_http_status(:ok)
    expect(assignment.reload.ride_context).to eq("indoor_only")
  end

  describe "GET /component_assignments" do
    it "never includes another user's assignments" do
      mine = create(:component_assignment, bike: create(:bike, user: current_user),
        component: create(:component, user: current_user))
      create(:component_assignment) # another user's

      get "/component_assignments"

      expect(JSON.parse(response.body).map { |a| a["id"] }).to eq([mine.id])
    end
  end

  describe "cross-account isolation" do
    it "404s on GET /component_assignments/:id for another user's assignment" do
      other_assignment = create(:component_assignment)

      get "/component_assignments/#{other_assignment.id}"

      expect(response).to have_http_status(:not_found)
    end

    it "404s on DELETE /component_assignments/:id for another user's assignment" do
      other_assignment = create(:component_assignment)

      delete "/component_assignments/#{other_assignment.id}"

      expect(response).to have_http_status(:not_found)
      expect(ComponentAssignment.exists?(other_assignment.id)).to be true
    end

    it "does not create against another user's bike" do
      other_bike = create(:bike)
      component = create(:component, user: current_user, category: "cassette")

      post "/component_assignments", params: {
        component_assignment: { component_id: component.id, bike_id: other_bike.id, started_at: "2026-01-01T00:00:00Z" },
      }

      expect(response).to have_http_status(:not_found)
    end

    it "does not create against another user's component" do
      other_component = create(:component, category: "cassette")
      bike = create(:bike, user: current_user)

      post "/component_assignments", params: {
        component_assignment: { component_id: other_component.id, bike_id: bike.id, started_at: "2026-01-01T00:00:00Z" },
      }

      expect(response).to have_http_status(:not_found)
    end
  end
end
