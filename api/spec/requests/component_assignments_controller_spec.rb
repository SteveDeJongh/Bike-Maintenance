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

  describe "POST /component_assignments: Install on bike" do
    let(:bike) { create(:bike, user: current_user, name: "Soloist") }
    let(:chain) { create(:component, user: current_user, label: "Chain S1", category: "chain") }
    let(:other_chain) { create(:component, user: current_user, label: "Chain S2", category: "chain") }

    def install(component, started_at:, ended_at: nil, bike_id: bike.id, track_slot: nil)
      params = { component_assignment: { component_id: component.id, bike_id: bike_id, started_at: started_at, ended_at: ended_at } }
      params[:track_slot] = track_slot unless track_slot.nil?
      post "/component_assignments", params: params
      JSON.parse(response.body)
    end

    it "creates a closed past stint in an empty window of the slot, leaving other assignments alone" do
      earlier = create(:component_assignment, bike: bike, component: other_chain,
        started_at: Time.zone.local(2026, 1, 1), ended_at: Time.zone.local(2026, 3, 1))
      later = create(:component_assignment, bike: bike, component: other_chain,
        started_at: Time.zone.local(2026, 6, 1))

      body = install(chain, started_at: "2026-03-01T00:00:00Z", ended_at: "2026-05-01T00:00:00Z")

      expect(response).to have_http_status(:created)
      expect(body).to include("ended_at" => be_present)
      expect([ earlier.reload.ended_at, later.reload.ended_at ]).to eq([ Time.zone.local(2026, 3, 1), nil ])
    end

    it "rejects a closed stint that overlaps the slot's other assignment, naming it" do
      create(:component_assignment, bike: bike, component: other_chain,
        started_at: Time.zone.local(2026, 6, 2), ended_at: Time.zone.local(2026, 9, 30))

      body = install(chain, started_at: "2026-07-01T00:00:00Z", ended_at: "2026-08-01T00:00:00Z")

      expect(response).to have_http_status(:unprocessable_content)
      expect(body["base"]).to eq([ "Overlaps Chain S2 on this slot, Jun 2 → Sep 30" ])
    end

    it "rejects a closed stint that overlaps the component's own stint on another bike" do
      gravel = create(:bike, user: current_user, name: "Libre")
      create(:component_assignment, bike: gravel, component: chain,
        started_at: Time.zone.local(2026, 2, 1), ended_at: Time.zone.local(2026, 4, 1))

      body = install(chain, started_at: "2026-03-01T00:00:00Z", ended_at: "2026-05-01T00:00:00Z")

      expect(response).to have_http_status(:unprocessable_content)
      expect(body["base"]).to eq([ "Overlaps its own installation on Libre, Feb 1 → Apr 1" ])
    end

    it "allows a closed stint before the component's current installation elsewhere" do
      gravel = create(:bike, user: current_user)
      create(:component_assignment, bike: gravel, component: chain, started_at: Time.zone.local(2026, 6, 1))

      install(chain, started_at: "2026-01-01T00:00:00Z", ended_at: "2026-05-01T00:00:00Z")

      expect(response).to have_http_status(:created)
      expect(chain.component_assignments.where(ended_at: nil).count).to eq(1)
    end

    it "rejects an end at or before the start, and future dates" do
      body = install(chain, started_at: "2026-03-01T00:00:00Z", ended_at: "2026-02-01T00:00:00Z")
      expect(response).to have_http_status(:unprocessable_content)
      expect(body["ended_at"]).to eq([ "must be after the installed date" ])

      install(chain, started_at: "2026-03-01T00:00:00Z", ended_at: "2026-03-01T00:00:00Z")
      expect(response).to have_http_status(:unprocessable_content)

      body = install(chain, started_at: 1.day.from_now.iso8601)
      expect(body["started_at"]).to eq([ "can't be in the future" ])

      body = install(chain, started_at: "2026-01-01T00:00:00Z", ended_at: 1.day.from_now.iso8601)
      expect(body["ended_at"]).to eq([ "can't be in the future" ])
    end

    it "takes an open install into an occupied slot only through swap" do
      occupant = create(:component_assignment, bike: bike, component: other_chain, started_at: Time.zone.local(2026, 1, 1))

      body = install(chain, started_at: "2026-03-01T00:00:00Z")
      expect(response).to have_http_status(:unprocessable_content)
      expect(body["base"].first).to start_with("Overlaps Chain S2 on this slot")

      post "/component_assignments/#{occupant.id}/swap", params: { component_id: chain.id, swapped_at: "2026-03-01T00:00:00Z" }
      expect(response).to have_http_status(:created)
      expect(occupant.reload.ended_at).to eq(Time.zone.parse("2026-03-01T00:00:00Z"))
    end

    it "starts tracking the category with track_slot, in one transaction" do
      install(chain, started_at: "2026-01-01T00:00:00Z", track_slot: true)

      expect(response).to have_http_status(:created)
      expect(bike.bike_component_slots.pluck(:category, :ride_context)).to eq([ %w[chain both] ])
    end

    it "leaves no slot behind when the install itself fails" do
      install(chain, started_at: 1.day.from_now.iso8601, track_slot: true)

      expect(response).to have_http_status(:unprocessable_content)
      expect(bike.bike_component_slots).to be_empty
    end

    it "404s on another user's bike, and creates nothing" do
      other_bike = create(:bike)
      install(chain, started_at: "2026-01-01T00:00:00Z", bike_id: other_bike.id, track_slot: true)

      expect(response).to have_http_status(:not_found)
      expect(other_bike.bike_component_slots).to be_empty
    end

    it "counts the back-filled stint's rides toward the component, and only those" do
      ride = ->(at, meters) { create(:strava_activity, user: current_user, bike: bike, moved_at: at, distance_meters: meters) }
      ride.call(Time.zone.local(2026, 2, 15), 1_000) # before
      ride.call(Time.zone.local(2026, 3, 10), 20_000) # inside
      ride.call(Time.zone.local(2026, 4, 20), 30_000) # inside
      ride.call(Time.zone.local(2026, 5, 1), 4_000) # at the end: half-open, outside
      ride.call(Time.zone.local(2026, 6, 1), 5_000) # after

      install(chain, started_at: "2026-03-01T00:00:00Z", ended_at: "2026-05-01T00:00:00Z")

      expect(response).to have_http_status(:created)
      expect(chain.reload.total_distance).to eq(50_000)
      expect(Maintenance::LifetimeDistanceQuery.call(current_user, component_ids: [ chain.id ])).to eq(chain.id => 50_000)
    end
  end

  describe "POST /component_assignments/:id/swap" do
    # Pins the frontend's swapOptions rule (utils/swapOptions.ts) to what
    # the endpoint really accepts for a shared indoor cassette.
    describe "a shared indoor cassette (allows_multiple_assignments)" do
      let(:start) { Time.zone.local(2026, 1, 1, 8, 0) }
      let(:swapped_at) { Time.zone.local(2026, 2, 1, 9, 0) }
      let!(:bike_1) { create(:bike, user: current_user, name: "One") }
      let!(:bike_2) { create(:bike, user: current_user, name: "Two") }
      let!(:bike_3) { create(:bike, user: current_user, name: "Three") }
      let!(:trainer_cassette) { create(:component, user: current_user, category: "cassette", label: "Trainer cassette") }

      before do
        expect(current_user.component_category_settings.find_by!(category: "cassette").allows_multiple_assignments).to be true
        [ bike_1, bike_2 ].each do |bike|
          create(:component_assignment, bike: bike, component: trainer_cassette, started_at: start, ride_context: "indoor_only")
        end
      end

      def slot(bike, ride_context)
        other = create(:component, user: current_user, category: "cassette")
        create(:component_assignment, bike: bike, component: other, started_at: start, ride_context: ride_context)
      end

      def swap(assignment)
        post "/component_assignments/#{assignment.id}/swap", params: { component_id: trainer_cassette.id, swapped_at: swapped_at.iso8601 }
      end

      it "swaps into a third bike's indoor_only slot" do
        swap(slot(bike_3, "indoor_only"))

        expect(response).to have_http_status(:created)
        expect(trainer_cassette.component_assignments.where(ended_at: nil).pluck(:bike_id)).to contain_exactly(bike_1.id, bike_2.id, bike_3.id)
      end

      it "rejects a both slot" do
        swap(slot(bike_3, "both"))
        expect(response).to have_http_status(:unprocessable_content)
      end

      it "rejects an outdoor_only slot" do
        swap(slot(bike_3, "outdoor_only"))
        expect(response).to have_http_status(:unprocessable_content)
      end

      it "rejects a bike it's already on" do
        # bike_1 already has the trainer cassette indoor_only; a second
        # indoor_only cassette there can't coexist in the first place, so
        # use an outdoor_only slot on that bike, which the cassette can't
        # take either.
        swap(slot(bike_1, "outdoor_only"))
        expect(response).to have_http_status(:unprocessable_content)
      end
    end

    it "ends the current assignment and installs the new component at exactly the swap time" do
      bike = create(:bike, user: current_user)
      chain_a = create(:component, user: current_user, category: "chain", label: "Chain A")
      chain_b = create(:component, user: current_user, category: "chain", label: "Chain B")
      assignment = create(:component_assignment, bike: bike, component: chain_a,
        started_at: Time.zone.local(2026, 1, 1, 8, 0), ended_at: nil, ride_context: "outdoor_only")
      swapped_at = Time.zone.local(2026, 2, 1, 9, 0)

      post "/component_assignments/#{assignment.id}/swap", params: {
        component_id: chain_b.id, swapped_at: swapped_at.iso8601,
      }

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body["ended_assignment"]["id"]).to eq(assignment.id)
      expect(Time.zone.parse(body["ended_assignment"]["ended_at"])).to eq(swapped_at)
      expect(body["assignment"]["component_id"]).to eq(chain_b.id)
      expect(body["assignment"]["bike_id"]).to eq(bike.id)
      expect(body["assignment"]["ride_context"]).to eq("outdoor_only")
      expect(Time.zone.parse(body["assignment"]["started_at"])).to eq(swapped_at)
      expect(body["assignment"]["ended_at"]).to be_nil

      assignment.reload
      expect(assignment.ended_at).to eq(swapped_at)
      new_assignment = ComponentAssignment.find(body["assignment"]["id"])
      expect(new_assignment.component_id).to eq(chain_b.id)
    end

    it "defaults swapped_at to now when omitted" do
      bike = create(:bike, user: current_user)
      chain_a = create(:component, user: current_user, category: "chain")
      chain_b = create(:component, user: current_user, category: "chain")
      assignment = create(:component_assignment, bike: bike, component: chain_a,
        started_at: Time.zone.local(2026, 4, 1), ended_at: nil)

      travel_to Time.zone.local(2026, 5, 1, 12, 0) do
        post "/component_assignments/#{assignment.id}/swap", params: { component_id: chain_b.id }
      end

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(Time.zone.parse(body["assignment"]["started_at"])).to eq(Time.zone.local(2026, 5, 1, 12, 0))
    end

    it "rejects a component of a different category" do
      bike = create(:bike, user: current_user)
      chain = create(:component, user: current_user, category: "chain")
      cassette = create(:component, user: current_user, category: "cassette")
      assignment = create(:component_assignment, bike: bike, component: chain, ended_at: nil)

      post "/component_assignments/#{assignment.id}/swap", params: { component_id: cassette.id }

      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["base"].join).to include("not a chain")
      expect(assignment.reload.ended_at).to be_nil
    end

    it "rejects a retired component" do
      bike = create(:bike, user: current_user)
      chain_a = create(:component, user: current_user, category: "chain")
      chain_b = create(:component, user: current_user, category: "chain", retired_on: Date.new(2026, 1, 1))
      assignment = create(:component_assignment, bike: bike, component: chain_a, ended_at: nil)

      post "/component_assignments/#{assignment.id}/swap", params: { component_id: chain_b.id }

      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["base"].join).to include("retired")
      expect(assignment.reload.ended_at).to be_nil
    end

    it "404s for a component owned by another user" do
      bike = create(:bike, user: current_user)
      chain_a = create(:component, user: current_user, category: "chain")
      other_component = create(:component, category: "chain")
      assignment = create(:component_assignment, bike: bike, component: chain_a, ended_at: nil)

      post "/component_assignments/#{assignment.id}/swap", params: { component_id: other_component.id }

      expect(response).to have_http_status(:not_found)
      expect(assignment.reload.ended_at).to be_nil
    end

    it "rejects swapping a component for itself" do
      bike = create(:bike, user: current_user)
      chain = create(:component, user: current_user, category: "chain")
      assignment = create(:component_assignment, bike: bike, component: chain, ended_at: nil)

      post "/component_assignments/#{assignment.id}/swap", params: { component_id: chain.id }

      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["base"].join).to include("itself")
      expect(assignment.reload.ended_at).to be_nil
    end

    it "rejects a swapped_at before the current assignment's own start" do
      bike = create(:bike, user: current_user)
      chain_a = create(:component, user: current_user, category: "chain")
      chain_b = create(:component, user: current_user, category: "chain")
      assignment = create(:component_assignment, bike: bike, component: chain_a,
        started_at: Time.zone.local(2026, 2, 1), ended_at: nil)

      post "/component_assignments/#{assignment.id}/swap", params: {
        component_id: chain_b.id, swapped_at: Time.zone.local(2026, 1, 1).iso8601,
      }

      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["base"].join).to include("after this installation's own start")
      expect(assignment.reload.ended_at).to be_nil
    end

    it "rolls back ending the current assignment when creating the new one fails" do
      bike = create(:bike, user: current_user)
      chain_a = create(:component, user: current_user, category: "chain")
      chain_b = create(:component, user: current_user, category: "chain")
      # chain_b is already mounted on another bike with no end date, so
      # installing it here too (not indoor_only/shared) fails
      # ComponentAssignment's own no_overlapping_assignment_for_component
      # validation -- exactly the "let the model validations decide"
      # conflict case, not one of this service's own pre-checks.
      create(:component_assignment, bike: create(:bike, user: current_user), component: chain_b, ended_at: nil)
      assignment = create(:component_assignment, bike: bike, component: chain_a,
        started_at: Time.zone.local(2026, 1, 1), ended_at: nil)

      post "/component_assignments/#{assignment.id}/swap", params: {
        component_id: chain_b.id, swapped_at: Time.zone.local(2026, 2, 1).iso8601,
      }

      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["base"].join).to include("Overlaps its own installation")
      expect(assignment.reload.ended_at).to be_nil
    end

    it "404s for another user's assignment" do
      other_assignment = create(:component_assignment, ended_at: nil)
      component = create(:component, user: current_user, category: other_assignment.component.category)

      post "/component_assignments/#{other_assignment.id}/swap", params: { component_id: component.id }

      expect(response).to have_http_status(:not_found)
    end
  end
end
