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
    user = create(:user)
    create(:service_type, user: user, name: "Wax")
    duplicate = build(:service_type, user: user, name: "wax")

    expect(duplicate).not_to be_valid
  end

  it "allows the same name for different users" do
    create(:service_type, name: "wax")
    other_user_type = build(:service_type, name: "wax")

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
  end
end
