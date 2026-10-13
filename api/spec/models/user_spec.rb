require "rails_helper"

RSpec.describe User, type: :model do
  it "is valid with a name and email" do
    expect(build(:user)).to be_valid
  end

  it "is invalid without a name" do
    user = build(:user, name: nil)

    expect(user).not_to be_valid
    expect(user.errors[:name]).to be_present
  end

  it "is invalid without an email" do
    user = build(:user, email: nil)

    expect(user).not_to be_valid
    expect(user.errors[:email]).to be_present
  end

  it "is invalid with a duplicate email" do
    create(:user, email: "taken@example.invalid")
    user = build(:user, email: "taken@example.invalid")

    expect(user).not_to be_valid
    expect(user.errors[:email]).to be_present
  end

  it "destroys its bikes and components when destroyed" do
    user = create(:user)
    bike = create(:bike, user: user)
    component = create(:component, user: user)

    user.destroy

    expect(Bike.exists?(bike.id)).to be false
    expect(Component.exists?(component.id)).to be false
  end

  it "destroys its strava activities when destroyed" do
    # user_id on strava_activities is NOT NULL, so this must cascade-destroy
    # rather than nullify (nullify would violate that constraint).
    user = create(:user)
    activity = create(:strava_activity, user: user, bike: create(:bike, user: user))

    user.destroy

    expect(StravaActivity.exists?(activity.id)).to be false
  end
end
