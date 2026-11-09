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

  it "is invalid with the same athlete_id already linked to a different user" do
    create(:strava_credential, athlete_id: 777)
    duplicate = build(:strava_credential, athlete_id: 777)

    expect(duplicate).not_to be_valid
    expect(duplicate.errors[:athlete_id]).to be_present
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

  describe "#full_sync_available_at / #full_sync_available?" do
    it "is available when neither started_at nor last_full_sync_at is set" do
      credential = build(:strava_credential, full_sync_started_at: nil, last_full_sync_at: nil)

      expect(credential.full_sync_available_at).to be_nil
      expect(credential.full_sync_available?).to be true
    end

    it "is unavailable within the cooldown after the last completed full sync" do
      credential = build(:strava_credential, last_full_sync_at: 5.minutes.ago)

      expect(credential.full_sync_available?).to be false
      expect(credential.full_sync_available_at).to be_within(1.second).of(5.minutes.ago + StravaCredential::FULL_SYNC_COOLDOWN)
    end

    it "is available again once the cooldown has passed" do
      credential = build(:strava_credential, last_full_sync_at: 20.minutes.ago)

      expect(credential.full_sync_available?).to be true
    end

    it "is unavailable while a full sync appears to still be running" do
      credential = build(:strava_credential, full_sync_started_at: 2.minutes.ago, last_full_sync_at: nil)

      expect(credential.full_sync_available?).to be false
      expect(credential.full_sync_available_at).to be_within(1.second).of(2.minutes.ago + StravaCredential::RUNNING_TIMEOUT)
    end

    it "treats a stale started_at as expired, self-healing a stuck lock" do
      credential = build(:strava_credential, full_sync_started_at: 20.minutes.ago, last_full_sync_at: nil)

      expect(credential.full_sync_available?).to be true
    end

    it "reports the later of the two blockers when both apply" do
      credential = build(:strava_credential, full_sync_started_at: 1.minute.ago, last_full_sync_at: 14.minutes.ago)

      # started_at's own blocker (1.minute.ago + RUNNING_TIMEOUT, ~9 minutes
      # from now) is later than last_full_sync_at's (14.minutes.ago +
      # FULL_SYNC_COOLDOWN, ~1 minute from now).
      expect(credential.full_sync_available_at).to be_within(1.second).of(1.minute.ago + StravaCredential::RUNNING_TIMEOUT)
    end
  end
end
