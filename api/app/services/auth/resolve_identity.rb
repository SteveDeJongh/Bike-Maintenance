module Auth
  # The one place that decides who an OAuth callback (Google, Strava, later
  # Apple) signs in, links, or creates -- see CLAUDE.md's Authentication
  # section for the four rules this implements, in order. Never link by an
  # email the provider didn't mark as verified: Google asserts
  # email_verified; Strava asserts no email at all, so it can only ever
  # reach the first-identity-exists or current_user-already-signed-in
  # branches, never the email-matching one.
  class ResolveIdentity
    class AlreadyLinkedToAnotherUser < StandardError; end

    Result = Struct.new(:user, :outcome, keyword_init: true)

    def initialize(provider:, uid:, email: nil, email_verified: false, name: nil, current_user: nil)
      @provider = provider
      @uid = uid
      @email = email
      @email_verified = email_verified
      @name = name
      @current_user = current_user
    end

    def call
      if (identity = UserIdentity.find_by(provider: provider, uid: uid))
        return sign_in_existing_identity(identity)
      end

      return link_to_current_user if current_user

      if email_verified && email.present? && (existing_user = User.find_by(email: email))
        return link_to_matching_email_user(existing_user)
      end

      create_and_link_new_user
    end

    private

    attr_reader :provider, :uid, :email, :email_verified, :name, :current_user

    def sign_in_existing_identity(identity)
      if current_user && identity.user_id != current_user.id
        raise AlreadyLinkedToAnotherUser
      end

      identity.update!(last_used_at: Time.current)
      Result.new(user: identity.user, outcome: :signed_in)
    end

    def link_to_current_user
      create_identity!(current_user)
      Result.new(user: current_user, outcome: :linked)
    end

    def link_to_matching_email_user(existing_user)
      create_identity!(existing_user)

      # The provider just proved ownership of this address. If the user's
      # own email was never confirmed (a password signup that never
      # verified), an unproven password could belong to someone who
      # registered the address before its real owner -- clear it so only
      # the real owner (now signed in via the provider) can set a new one.
      if existing_user.email_verified_at.nil?
        existing_user.update!(email_verified_at: Time.current, password_digest: nil)
      end

      Result.new(user: existing_user, outcome: :linked)
    end

    def create_and_link_new_user
      new_user = User.create!(name: name.presence || "New user", email: (email if email_verified))
      create_identity!(new_user)
      Result.new(user: new_user, outcome: :created)
    end

    def create_identity!(user)
      UserIdentity.create!(
        user: user, provider: provider, uid: uid, email: email,
        email_verified: email_verified, last_used_at: Time.current,
      )
    end
  end
end
