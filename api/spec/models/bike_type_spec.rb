require "rails_helper"

RSpec.describe BikeType, type: :model do
  it "is valid with a user and name" do
    expect(build(:bike_type)).to be_valid
  end

  it "is invalid without a name" do
    bike_type = build(:bike_type, name: nil)

    expect(bike_type).not_to be_valid
    expect(bike_type.errors[:name]).to be_present
  end

  it "is invalid with a duplicate name for the same user, case-insensitively" do
    # "Cyclocross" is deliberately not one of the types Users::Provision
    # seeds automatically (Road/Gravel/Mountain/Time Trial/Commuter), so
    # this stays a clean test of the uniqueness validation itself.
    user = create(:user)
    create(:bike_type, user: user, name: "Cyclocross")
    duplicate = build(:bike_type, user: user, name: "cyclocross")

    expect(duplicate).not_to be_valid
  end

  it "allows the same name for different users" do
    create(:bike_type, name: "Cyclocross")
    other_user_type = build(:bike_type, name: "Cyclocross")

    expect(other_user_type).to be_valid
  end

  describe "#default_categories=" do
    it "strips whitespace, drops blanks, and dedupes" do
      bike_type = build(:bike_type, default_categories: [ " chain ", "cassette", "", " ", "chain" ])

      expect(bike_type.default_categories).to eq(%w[chain cassette])
    end
  end

  describe "destroy" do
    it "nullifies bike_type_id on bikes using it, rather than being blocked" do
      bike_type = create(:bike_type)
      bike = create(:bike, user: bike_type.user, bike_type: bike_type)

      expect(bike_type.destroy).to be_truthy
      expect(bike.reload.bike_type_id).to be_nil
    end
  end
end
