require "rails_helper"

RSpec.describe Auth::ResolveIdentity, type: :model do
  def resolve(**attrs)
    described_class.new(**attrs).call
  end

  describe "when the identity already exists" do
    it "signs in that identity's user" do
      identity = create(:user_identity, provider: "google", uid: "123")

      result = resolve(provider: "google", uid: "123")

      expect(result.outcome).to eq(:signed_in)
      expect(result.user).to eq(identity.user)
    end

    it "touches last_used_at" do
      identity = create(:user_identity, provider: "google", uid: "123", last_used_at: 1.day.ago)

      resolve(provider: "google", uid: "123")

      expect(identity.reload.last_used_at).to be_within(1.second).of(Time.current)
    end

    it "is a no-op when the signed-in current_user is already that identity's owner" do
      identity = create(:user_identity, provider: "strava", uid: "456")

      result = resolve(provider: "strava", uid: "456", current_user: identity.user)

      expect(result.outcome).to eq(:signed_in)
      expect(result.user).to eq(identity.user)
    end

    it "refuses when a different signed-in current_user tries to link an identity owned by someone else" do
      identity = create(:user_identity, provider: "strava", uid: "456")
      other_user = create(:user)

      expect {
        resolve(provider: "strava", uid: "456", current_user: other_user)
      }.to raise_error(Auth::ResolveIdentity::AlreadyLinkedToAnotherUser)
    end
  end

  describe "when signed in (the link flow) and the identity doesn't exist yet" do
    it "attaches the identity to current_user" do
      user = create(:user)

      result = resolve(provider: "strava", uid: "789", current_user: user)

      expect(result.outcome).to eq(:linked)
      expect(result.user).to eq(user)
      expect(user.user_identities.find_by(provider: "strava", uid: "789")).to be_present
    end
  end

  describe "when not signed in, no identity yet, and the provider asserts a verified email matching an existing user" do
    it "links and signs in when that user's own email is already verified" do
      existing = create(:user, email: "jamie@example.invalid", email_verified_at: 1.day.ago, password: "password123")

      result = resolve(provider: "google", uid: "g1", email: "jamie@example.invalid", email_verified: true)

      expect(result.outcome).to eq(:linked)
      expect(result.user).to eq(existing)
      expect(existing.reload.password_digest).to be_present
      expect(existing.user_identities.find_by(provider: "google", uid: "g1")).to be_present
    end

    it "links, verifies, and clears the password when that user's own email was unverified" do
      existing = create(:user, email: "jamie@example.invalid", email_verified_at: nil, password: "password123")

      result = resolve(provider: "google", uid: "g1", email: "jamie@example.invalid", email_verified: true)

      expect(result.outcome).to eq(:linked)
      expect(result.user).to eq(existing)
      existing.reload
      expect(existing.email_verified_at).to be_present
      expect(existing.password_digest).to be_nil
      expect(existing.user_identities.find_by(provider: "google", uid: "g1")).to be_present
    end

    it "does not match by an unverified email" do
      create(:user, email: "jamie@example.invalid")

      result = resolve(provider: "google", uid: "g1", email: "jamie@example.invalid", email_verified: false)

      expect(result.outcome).to eq(:created)
      expect(result.user.email).to be_nil
    end
  end

  describe "otherwise" do
    it "creates a new user, provisions defaults, and signs in" do
      result = resolve(provider: "google", uid: "g2", email: "new@example.invalid", email_verified: true, name: "Jamie")

      expect(result.outcome).to eq(:created)
      expect(result.user.name).to eq("Jamie")
      expect(result.user.email).to eq("new@example.invalid")
      expect(result.user.service_types.count).to eq(4)
      expect(result.user.user_identities.find_by(provider: "google", uid: "g2")).to be_present
    end

    it "falls back to a generic name when the provider gives none (Strava never does)" do
      result = resolve(provider: "strava", uid: "s1")

      expect(result.outcome).to eq(:created)
      expect(result.user.name).to be_present
      expect(result.user.email).to be_nil
    end
  end
end
