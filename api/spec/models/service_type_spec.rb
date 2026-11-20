require "rails_helper"

RSpec.describe ServiceType, type: :model do
  it "is valid with a user and name" do
    expect(build(:service_type)).to be_valid
  end

  it "is invalid without a name" do
    service_type = build(:service_type, name: nil)

    expect(service_type).not_to be_valid
    expect(service_type.errors[:name]).to be_present
  end

  it "is invalid with a duplicate name for the same user, case-insensitively" do
    # "Lube" is deliberately not one of the service types Users::Provision
    # seeds automatically (wax/clean/replace/inspect), so this stays a clean
    # test of the uniqueness validation itself.
    user = create(:user)
    create(:service_type, user: user, name: "Lube")
    duplicate = build(:service_type, user: user, name: "lube")

    expect(duplicate).not_to be_valid
  end

  it "allows the same name for different users" do
    create(:service_type, name: "lube")
    other_user_type = build(:service_type, name: "lube")

    expect(other_user_type).to be_valid
  end

  describe "destroy" do
    it "is destroyed when it has no maintenance events" do
      service_type = create(:service_type)

      expect(service_type.destroy).to be_truthy
      expect(ServiceType.exists?(service_type.id)).to be false
    end

    it "is not destroyed when it has maintenance events" do
      service_type = create(:service_type)
      create(:maintenance_event, service_type: service_type, component: create(:component, user: service_type.user))

      expect(service_type.destroy).to be_falsey
      expect(ServiceType.exists?(service_type.id)).to be true
    end

    it "is not destroyed when a service requirement satisfier references it" do
      template = create(:category_service_requirement)
      service_type = template.satisfiers.first.service_type

      expect(service_type.destroy).to be_falsey
      expect(ServiceType.exists?(service_type.id)).to be true
    end
  end

  describe "category tags" do
    let(:user) { create(:user) }

    def tagged(name, *categories)
      create(:service_type, user: user, name: name).tap do |type|
        categories.each { |category| create(:service_type_category, service_type: type, category: category) }
      end
    end

    describe ".applicable_to" do
      it "returns types tagged for the category plus untagged (universal) types, excluding types tagged only elsewhere" do
        hot_wax = tagged("Hot wax", "chain")
        multi = tagged("Degrease", "cassette", "chain")
        fork_service = tagged("Fork 200 h", "front_suspension")
        universal = create(:service_type, user: user, name: "Torque check")

        result = user.service_types.applicable_to("chain")

        expect(result).to include(hot_wax, multi, universal)
        expect(result).not_to include(fork_service)
      end
    end

    describe "#applicable_to?" do
      it "is true for a universal type and for a matching tag, false otherwise" do
        expect(create(:service_type, user: user).applicable_to?("chain")).to be(true)
        expect(tagged("Hot wax", "chain").applicable_to?("chain")).to be(true)
        expect(tagged("Fork 200 h", "front_suspension").applicable_to?("chain")).to be(false)
      end
    end

    it "deletes its tags along with the type" do
      type = tagged("Hot wax", "chain", "cassette")

      expect { type.destroy! }.to change(ServiceTypeCategory, :count).by(-2)
    end

    describe "#replace_categories!" do
      it "replaces the full set, stripping blanks and duplicates" do
        type = tagged("Hot wax", "chain", "cassette")

        type.replace_categories!([" chain ", "chainring", "", "chainring"])

        expect(type.reload.categories).to eq(%w[chain chainring])
      end

      it "makes the type universal with an empty list" do
        type = tagged("Hot wax", "chain")

        type.replace_categories!([])

        expect(type.reload).to be_universal
      end
    end

    describe "#tag_for!" do
      it "adds the tag when the type is tagged, but not for this category" do
        type = tagged("Degrease", "cassette")

        type.tag_for!("chain")

        expect(type.reload.categories).to eq(%w[cassette chain])
      end

      it "leaves a universal type universal -- it already applies everywhere" do
        type = create(:service_type, user: user)

        type.tag_for!("chain")

        expect(type.reload).to be_universal
      end

      it "is a no-op when the tag is already there, and never removes tags" do
        type = tagged("Hot wax", "chain", "cassette")

        expect { type.tag_for!("chain") }.not_to change(ServiceTypeCategory, :count)
        expect(type.reload.categories).to eq(%w[cassette chain])
      end
    end
  end
end
