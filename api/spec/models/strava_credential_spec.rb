require "rails_helper"

RSpec.describe StravaCredential, type: :model do
  it "is valid with a user, tokens, athlete_id, and expires_at" do
    expect(build(:strava_credential)).to be_valid
  end

  it "is invalid without an access_token" do
    credential = build(:strava_credential, access_token: nil)

    expect(credential).not_to be_valid
    expect(credential.errors[:access_token]).to be_present
  end

  it "is invalid without a refresh_token" do
    credential = build(:strava_credential, refresh_token: nil)

    expect(credential).not_to be_valid
    expect(credential.errors[:refresh_token]).to be_present
  end

  it "is invalid with a second credential for the same user" do
    user = create(:user)
    create(:strava_credential, user: user)
    duplicate = build(:strava_credential, user: user)

    expect(duplicate).not_to be_valid
    expect(duplicate.errors[:user_id]).to be_present
  end

  describe "#ensure_fresh_access_token!" do
    it "returns the current access_token when it is not near expiry" do
      credential = create(:strava_credential, access_token: "still-good", expires_at: 1.hour.from_now)

      expect(credential.ensure_fresh_access_token!).to eq("still-good")
    end

    it "refreshes and persists the rotated tokens when near expiry" do
      credential = create(:strava_credential, access_token: "stale", refresh_token: "old-refresh",
        expires_at: 1.minute.from_now)
      new_expiry = 6.hours.from_now
      client = instance_double(Strava::Client)
      allow(Strava::Client).to receive(:new).and_return(client)
      allow(client).to receive(:refresh_access_token).with("old-refresh").and_return(
        "access_token" => "fresh",
        "refresh_token" => "new-refresh",
        "expires_at" => new_expiry.to_i,
      )

      result = credential.ensure_fresh_access_token!

      expect(result).to eq("fresh")
      expect(credential.reload.access_token).to eq("fresh")
      expect(credential.refresh_token).to eq("new-refresh")
      expect(credential.expires_at).to be_within(1.second).of(Time.at(new_expiry.to_i))
    end
  end
end
