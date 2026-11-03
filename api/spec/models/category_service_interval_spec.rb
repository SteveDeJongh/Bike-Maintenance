require "rails_helper"

RSpec.describe CategoryServiceInterval, type: :model do
  it "is valid with a user, category, service_type, and a distance interval" do
    expect(build(:category_service_interval)).to be_valid
  end

  it "is valid with only a time interval set" do
    interval = build(:category_service_interval, distance_interval_meters: nil, time_interval_days: 30)

    expect(interval).to be_valid
  end

  it "is invalid when the service_type belongs to a different user" do
    interval = build(:category_service_interval, user: create(:user), service_type: create(:service_type))

    expect(interval).not_to be_valid
    expect(interval.errors[:base]).to include(a_string_matching(/same user/))
  end

  it "is invalid without a category" do
    interval = build(:category_service_interval, category: nil)

    expect(interval).not_to be_valid
    expect(interval.errors[:category]).to be_present
  end

  it "is invalid with neither a distance nor a time interval" do
    interval = build(:category_service_interval, distance_interval_meters: nil, time_interval_days: nil)

    expect(interval).not_to be_valid
    expect(interval.errors[:base]).to be_present
  end

  it "is invalid with a duplicate (user, category, service_type)" do
    user = create(:user)
    service_type = create(:service_type, user: user)
    create(:category_service_interval, user: user, category: "chain", service_type: service_type)
    duplicate = build(:category_service_interval, user: user, category: "chain", service_type: service_type)

    expect(duplicate).not_to be_valid
  end

  it "allows the same category and service_type for a different user" do
    create(:category_service_interval, category: "chain")
    other_user_interval = build(:category_service_interval, category: "chain")

    expect(other_user_interval).to be_valid
  end

  it "cascades to destroy its linked component service intervals when destroyed" do
    # Creating a component in the same category auto-applies the template
    # (Component#after_create -- see apply_category_service_intervals), so
    # the linked row already exists; no need to create it explicitly.
    template = create(:category_service_interval)
    component = create(:component, user: template.user, category: template.category)
    linked = component.component_service_intervals.find_by!(service_type: template.service_type)

    template.destroy!

    expect(ComponentServiceInterval.exists?(linked.id)).to be false
  end
end
