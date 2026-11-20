require "rails_helper"

RSpec.describe "ServiceTypes", type: :request do
  let!(:current_user) { create(:user) }
  before { sign_in(current_user) }

  describe "GET /service_types" do
    it "returns the user's own service types (wax/clean/replace/inspect, auto-provisioned)" do
      get "/service_types"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body).map { |t| t["name"] }).to match_array(%w[wax clean replace inspect])
    end

    it "never includes another user's service types" do
      create(:service_type, name: "Lube") # another user's

      get "/service_types"

      expect(JSON.parse(response.body).map { |t| t["name"] }).not_to include("Lube")
    end
  end

  describe "POST /service_types" do
    it "creates a service type for the current user" do
      post "/service_types", params: { service_type: { name: "Lube" } }

      expect(response).to have_http_status(:created)
      expect(current_user.service_types.find_by(name: "Lube")).to be_present
    end

    it "rejects a duplicate name, case-insensitively" do
      post "/service_types", params: { service_type: { name: "Wax" } }

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "cross-account isolation" do
    it "404s on GET /service_types/:id for another user's service type" do
      other_type = create(:service_type)

      get "/service_types/#{other_type.id}"

      expect(response).to have_http_status(:not_found)
    end

    it "404s on PATCH /service_types/:id for another user's service type" do
      other_type = create(:service_type, name: "Original")

      patch "/service_types/#{other_type.id}", params: { service_type: { name: "Hijacked" } }

      expect(response).to have_http_status(:not_found)
      expect(other_type.reload.name).to eq("Original")
    end

    it "404s on DELETE /service_types/:id for another user's service type" do
      other_type = create(:service_type)

      delete "/service_types/#{other_type.id}"

      expect(response).to have_http_status(:not_found)
      expect(ServiceType.exists?(other_type.id)).to be true
    end
  end

  describe "DELETE /service_types/:id" do
    it "is blocked while still in use by a maintenance event" do
      service_type = current_user.service_types.find_by!(name: "wax")
      create(:maintenance_event, component: create(:component, user: current_user), service_type: service_type)

      delete "/service_types/#{service_type.id}"

      expect(response).to have_http_status(:unprocessable_content)
      expect(ServiceType.exists?(service_type.id)).to be true
    end
  end

  describe "category tags and usage counts" do
    def json
      JSON.parse(response.body)
    end

    def tag(type, *categories)
      categories.each { |category| create(:service_type_category, service_type: type, category: category) }
      type
    end

    it "includes categories, requirement_count and event_count in index and show" do
      hot_wax = tag(create(:service_type, user: current_user, name: "Hot wax"), "chain", "cassette")
      create(:category_service_requirement, user: current_user, category: "chain", service_type: hot_wax)
      # Creating a chain component auto-links it to the chain template; that
      # linked row inherits the template's satisfier and isn't counted again.
      component = create(:component, user: current_user, category: "chain")
      expect(component.component_service_requirements.where.not(category_service_requirement_id: nil)).to exist
      create(:component_service_requirement, component: component, service_type: hot_wax)
      create_list(:maintenance_event, 3, component: component, service_type: hot_wax)

      get "/service_types"
      row = json.find { |t| t["name"] == "Hot wax" }
      expect(row).to include("categories" => %w[cassette chain], "requirement_count" => 2, "event_count" => 3)
      expect(json.find { |t| t["name"] == "inspect" }).to include("categories" => [], "requirement_count" => 0, "event_count" => 0)

      get "/service_types/#{hot_wax.id}"
      expect(json).to include("categories" => %w[cassette chain], "requirement_count" => 2, "event_count" => 3)
    end

    it "computes the index in a constant number of queries, however many types there are" do
      count_queries = lambda do
        queries = 0
        counter = ->(*, payload) { queries += 1 unless payload[:name] == "SCHEMA" || payload[:cached] }
        ActiveSupport::Notifications.subscribed(counter, "sql.active_record") { get "/service_types" }
        queries
      end

      baseline = count_queries.call

      component = create(:component, user: current_user, category: "chain")
      5.times do |i|
        type = tag(create(:service_type, user: current_user, name: "Type #{i}"), "chain", "cassette")
        create(:category_service_requirement, user: current_user, category: "chain", service_type: type)
        create(:maintenance_event, component: component, service_type: type)
      end

      expect(count_queries.call).to eq(baseline)
    end

    it "creates a type with categories (the inline-create path sends categories: [category])" do
      post "/service_types", params: { service_type: { name: "Sealant top-up", categories: ["tire_front"] } }, as: :json

      expect(response).to have_http_status(:created)
      expect(json["categories"]).to eq(%w[tire_front])
      expect(current_user.service_types.find(json["id"]).categories).to eq(%w[tire_front])
    end

    it "creates a universal type when categories is empty or omitted" do
      post "/service_types", params: { service_type: { name: "Torque check", categories: [] } }, as: :json
      expect(json["categories"]).to eq([])

      post "/service_types", params: { service_type: { name: "Bolt check" } }, as: :json
      expect(json["categories"]).to eq([])
    end

    it "replaces the full set on update, dropping blanks and duplicates" do
      type = tag(create(:service_type, user: current_user, name: "Degrease"), "chain", "cassette")

      patch "/service_types/#{type.id}", params: { service_type: { categories: ["chain", "chainring", "", "chainring"] } }, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["categories"]).to eq(%w[chain chainring])
      expect(type.reload.categories).to eq(%w[chain chainring])
    end

    it "makes the type universal with categories: []" do
      type = tag(create(:service_type, user: current_user, name: "Degrease"), "chain")

      patch "/service_types/#{type.id}", params: { service_type: { categories: [] } }, as: :json

      expect(type.reload).to be_universal
    end

    it "leaves the tags alone when categories is omitted (a plain rename)" do
      type = tag(create(:service_type, user: current_user, name: "Degrease"), "chain")

      patch "/service_types/#{type.id}", params: { service_type: { name: "Degreaser" } }, as: :json

      expect(type.reload).to have_attributes(name: "Degreaser", categories: %w[chain])
    end

    it "changes neither the name nor the tags when the name is invalid" do
      type = tag(create(:service_type, user: current_user, name: "Degrease"), "chain")

      patch "/service_types/#{type.id}", params: { service_type: { name: "inspect", categories: ["cassette"] } }, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(type.reload).to have_attributes(name: "Degrease", categories: %w[chain])
    end

    it "can't tag another user's service type" do
      others = tag(create(:service_type, name: "Their wax"), "chain")

      patch "/service_types/#{others.id}", params: { service_type: { categories: ["cassette"] } }, as: :json

      expect(response).to have_http_status(:not_found)
      expect(others.reload.categories).to eq(%w[chain])
    end

    it "never counts another user's events or satisfiers" do
      mine = create(:service_type, user: current_user, name: "Hot wax")
      other_component = create(:component)
      create(:maintenance_event, component: other_component) # a different user's own type

      get "/service_types"

      expect(json.find { |t| t["id"] == mine.id }).to include("requirement_count" => 0, "event_count" => 0)
      expect(json.map { |t| t["id"] }).to match_array(current_user.service_types.pluck(:id))
    end
  end
end
