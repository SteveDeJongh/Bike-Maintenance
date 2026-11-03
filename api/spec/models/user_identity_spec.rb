require "rails_helper"

RSpec.describe UserIdentity, type: :model do
  it "is valid with a user, provider, and uid" do
    expect(build(:user_identity)).to be_valid
  end

  it "is invalid with a provider outside the known set" do
    identity = build(:user_identity, provider: "facebook")

    expect(identity).not_to be_valid
    expect(identity.errors[:provider]).to be_present
  end

  it "is invalid without a uid" do
    identity = build(:user_identity, uid: nil)

    expect(identity).not_to be_valid
    expect(identity.errors[:uid]).to be_present
  end

  it "is invalid with a duplicate (provider, uid)" do
    create(:user_identity, provider: "google", uid: "123")
    duplicate = build(:user_identity, provider: "google", uid: "123")

    expect(duplicate).not_to be_valid
    expect(duplicate.errors[:uid]).to be_present
  end

  it "allows the same uid across different providers" do
    create(:user_identity, provider: "google", uid: "123")
    other_provider = build(:user_identity, provider: "strava", uid: "123")

    expect(other_provider).to be_valid
  end

  it "is invalid with a second identity for the same provider on the same user" do
    user = create(:user)
    create(:user_identity, user: user, provider: "google")
    duplicate = build(:user_identity, user: user, provider: "google")

    expect(duplicate).not_to be_valid
    expect(duplicate.errors[:user_id]).to be_present
  end

  it "allows the same user to have identities for different providers" do
    user = create(:user)
    create(:user_identity, user: user, provider: "google")
    other_provider = build(:user_identity, user: user, provider: "strava")

    expect(other_provider).to be_valid
  end

  it "is destroyed along with its user" do
    user = create(:user)
    identity = create(:user_identity, user: user)

    user.destroy

    expect(UserIdentity.exists?(identity.id)).to be false
  end
end
