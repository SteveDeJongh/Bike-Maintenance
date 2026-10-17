require "rails_helper"

# This controller is otherwise plain CRUD (covered by ComponentAssignment's own
# model specs), but ride_context being silently dropped from strong params is
# exactly the kind of bug a model spec can never catch -- caught once already
# (POST with ride_context: "outdoor_only" silently saved as "both"), so it gets
# a narrow regression spec here rather than a full request-spec suite.
RSpec.describe "ComponentAssignments", type: :request do
  let!(:current_user) { create(:user) }

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
end
