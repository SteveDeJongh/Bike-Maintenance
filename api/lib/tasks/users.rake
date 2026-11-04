namespace :users do
  desc "Usage: rails \"users:claim[email@example.com]\" -- claims the pre-auth seed user " \
    "(created by 20261013224709_add_user_to_ownership_tables.rb, back when the app was single-user " \
    "with no real accounts) for a real email, marking it verified, and links its Strava credential " \
    "(if any) as a sign-in identity. The first Google/Strava sign-in with a matching verified email " \
    "then lands on this account's existing data instead of creating an empty one."
  task :claim, [:email] => :environment do |_t, args|
    email = args[:email] or abort "Usage: rails \"users:claim[email@example.com]\""

    # password_digest: nil rules out an ordinary unverified email/password
    # signup, which would otherwise look identical to the seed user under
    # just the other two conditions -- the seed user predates has_secure_password
    # entirely and has never had a password set.
    candidates = User.where(email_verified_at: nil, password_digest: nil).where.missing(:user_identities)
    abort "No unclaimed seed user found -- every user already has a verified email or a linked identity." if candidates.none?
    abort "More than one unclaimed user found -- ambiguous, resolve manually in the console." if candidates.many?

    user = candidates.first
    user.update!(email: email, email_verified_at: Time.current)

    if user.strava_credential
      UserIdentity.find_or_create_by!(provider: "strava", uid: user.strava_credential.athlete_id.to_s) do |identity|
        identity.user = user
      end
    end

    puts "Claimed user ##{user.id} as #{user.email}#{" (linked existing Strava credential)" if user.strava_credential}."
  end
end
