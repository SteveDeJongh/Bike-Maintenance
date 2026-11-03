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

  it "is valid without an email (a Google/Strava-only user asserts no email, or Strava never does)" do
    user = build(:user, email: nil, password: nil)

    expect(user).to be_valid
  end

  it "is invalid with a duplicate email" do
    create(:user, email: "taken@example.invalid")
    user = build(:user, email: "taken@example.invalid")

    expect(user).not_to be_valid
    expect(user.errors[:email]).to be_present
  end

  it "is invalid with a duplicate email, case-insensitively" do
    create(:user, email: "taken@example.invalid")
    user = build(:user, email: "TAKEN@EXAMPLE.INVALID")

    expect(user).not_to be_valid
    expect(user.errors[:email]).to be_present
  end

  it "normalizes email by stripping whitespace and downcasing" do
    user = create(:user, email: "  Mixed.Case@Example.Invalid  ")

    expect(user.email).to eq("mixed.case@example.invalid")
  end

  it "has no password by default requirement -- password is optional" do
    expect(build(:user, password: nil)).to be_valid
  end

  it "is invalid with a password shorter than 8 characters" do
    user = build(:user, password: "short")

    expect(user).not_to be_valid
    expect(user.errors[:password]).to be_present
  end

  describe "#has_password?" do
    it "is true once a password is set" do
      expect(create(:user, password: "password123").has_password?).to be true
    end

    it "is false without one" do
      expect(create(:user, password: nil).has_password?).to be false
    end
  end

  describe "#authenticate" do
    it "returns the user when the password matches" do
      user = create(:user, password: "password123")

      expect(user.authenticate("password123")).to eq(user)
    end

    it "returns false when the password does not match" do
      user = create(:user, password: "password123")

      expect(user.authenticate("wrong")).to be false
    end
  end

  it "destroys its bikes and components when destroyed" do
    user = create(:user)
    bike = create(:bike, user: user)
    component = create(:component, user: user)

    user.destroy

    expect(Bike.exists?(bike.id)).to be false
    expect(Component.exists?(component.id)).to be false
  end

  it "destroys its table view preferences when destroyed" do
    user = create(:user)
    preference = create(:table_view_preference, user: user)

    user.destroy

    expect(TableViewPreference.exists?(preference.id)).to be false
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
