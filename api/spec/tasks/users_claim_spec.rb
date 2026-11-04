require "rails_helper"
require "rake"

RSpec.describe "users:claim", type: :task do
  before(:all) do
    Rails.application.load_tasks if Rake::Task.tasks.empty?
  end

  before { Rake::Task["users:claim"].reenable }

  def invoke(email)
    Rake::Task["users:claim"].invoke(email)
  end

  it "sets the email and marks it verified on the sole unclaimed (no identities, unverified) user" do
    seed_user = create(:user, email: nil, email_verified_at: nil, password: nil)

    invoke("owner@example.com")

    seed_user.reload
    expect(seed_user.email).to eq("owner@example.com")
    expect(seed_user.email_verified_at).to be_present
  end

  it "links an existing Strava credential as a sign-in identity" do
    seed_user = create(:user, email: nil, email_verified_at: nil, password: nil)
    credential = create(:strava_credential, user: seed_user, athlete_id: 777)

    invoke("owner@example.com")

    identity = seed_user.user_identities.find_by(provider: "strava")
    expect(identity).to be_present
    expect(identity.uid).to eq(credential.athlete_id.to_s)
  end

  it "does not create a Strava identity when there is no credential" do
    create(:user, email: nil, email_verified_at: nil, password: nil)

    invoke("owner@example.com")

    expect(UserIdentity.count).to eq(0)
  end

  it "aborts when no unclaimed user exists" do
    create(:user, email_verified_at: Time.current) # already verified, nothing to claim

    expect { invoke("owner@example.com") }.to raise_error(SystemExit)
  end

  it "does not match an ordinary unverified email/password signup (it has a password; the seed user never does)" do
    create(:user, email: "pending@example.invalid", email_verified_at: nil, password: "password123")

    expect { invoke("owner@example.com") }.to raise_error(SystemExit)
  end

  it "aborts when more than one unclaimed user exists" do
    create(:user, email: nil, email_verified_at: nil, password: nil)
    create(:user, email: nil, email_verified_at: nil, password: nil)

    expect { invoke("owner@example.com") }.to raise_error(SystemExit)
  end

  it "does not match a user with a verified email, even without identities" do
    create(:user, email: "already-verified@example.invalid", email_verified_at: Time.current)

    expect { invoke("owner@example.com") }.to raise_error(SystemExit)
  end

  it "does not match a user who already has a linked identity, even if unverified" do
    user = create(:user, email: nil, email_verified_at: nil, password: nil)
    create(:user_identity, user: user)

    expect { invoke("owner@example.com") }.to raise_error(SystemExit)
  end
end
