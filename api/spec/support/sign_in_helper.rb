module SignInHelper
  # Goes through the real POST /auth/login endpoint rather than poking at
  # session internals, so request specs exercise the same path a real
  # client does. Relies on the :user factory's default password.
  def sign_in(user, password: "password123")
    post "/auth/login", params: { email: user.email, password: password }
  end
end

RSpec.configure do |config|
  config.include SignInHelper, type: :request
end
