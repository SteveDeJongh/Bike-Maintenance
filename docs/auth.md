# Authentication

> Reference material split out of CLAUDE.md. A quoted cross-reference such as "see \"Strava integration\"" names a `##` section heading; CLAUDE.md's "Further docs" list says which docs/ file holds each heading.

## Authentication

Real login — email/password and Strava (Google designed for but deferred, see below). Built in Rails, no hosted auth vendor.

- **Sessions, not tokens.** `ActionController::API` excludes cookie/session/
  CSRF middleware by default; `config/application.rb` adds back
  `ActionDispatch::Cookies` + `ActionDispatch::Session::CookieStore` (an
  httpOnly, `SameSite=Lax` cookie), and `ApplicationController` includes
  `ActionController::Cookies` + `ActionController::RequestForgeryProtection`
  (`protect_from_forgery with: :exception`). `current_user` is
  `User.find_by(id: session[:user_id])`; a `before_action
  :require_authentication` 401s every request with no `current_user`, skipped
  only on the auth endpoints themselves (`Auth::RegistrationsController#create`,
  `Auth::SessionsController#create`/`#destroy`, `Auth::CsrfController#show`,
  `Auth::PasswordsController#forgot`/`#reset`,
  `Auth::EmailVerificationsController#verify`, `StravaController#authorize`/
  `#callback`) and `/up`. Every sign-in/sign-out path calls `reset_session`
  first (session fixation). **Gotcha**: including `RequestForgeryProtection`
  directly on `ApplicationController` gives it its own `allow_forgery_protection`
  class_attribute with a fresh `true` default, shadowing whatever
  `ActionController::API` had already inherited from
  `config.action_controller.allow_forgery_protection` (which `test.rb` sets to
  `false`) — `ApplicationController` forwards that config value explicitly to
  fix it.
- **Gotcha, the expensive one**: `config/initializers/cors.rb` must set
  `credentials: true` on the `resource` block, and `origins` must be a literal
  origin (never `"*"`) — without `credentials: true`, the browser still sends
  the session cookie on the frontend's `fetch(..., { credentials: 'include' })`
  calls, but refuses to let the frontend's JavaScript read the response at
  all. That isn't a clean 401; `fetch()` just rejects with a generic network
  error, which looks exactly like "not signed in" even when the server-side
  sign-in genuinely succeeded (confirmed: the Rails log showed a correct
  session + successful `Auth::ResolveIdentity` match, while the SPA still
  bounced straight back to `/login`). Easy to miss because every backend
  request spec exercises the Rack app directly and never goes through actual
  browser CORS enforcement at all — only a real browser surfaces this.
- **CSRF**: the SPA fetches a token from `GET /auth/csrf` (works before
  login — the token is tied to the session, not to a signed-in user), caches
  it in memory, and sends it as `X-CSRF-Token` on every non-GET request
  (`frontend/src/api/client.ts`, lazily fetched on the first non-GET call of
  a page load, not on boot). `rack-attack` (not CSRF-related, but
  lives at this layer too) throttles `/auth/login`, `/auth/register`,
  `/auth/password/forgot`, and `/auth/email/resend` by IP and (for
  login/forgot-password) by email — `config/initializers/rack_attack.rb`
  reads the email from the raw JSON body when present, since Rack::Attack
  runs ahead of Rails' own parameter parsing and the frontend posts JSON, not
  form-encoded params.
- **`Auth::ResolveIdentity`** (`app/services/auth/resolve_identity.rb`) is the
  one place that decides who an OAuth callback signs in, links, or creates,
  in order:
  1. An identity already exists for `(provider, uid)` → sign in that user. If
     a different `current_user` is already signed in (the explicit "link"
     flow from Account settings hit an identity owned by someone else),
     raise `AlreadyLinkedToAnotherUser` instead.
  2. No identity yet, but `current_user` is signed in (the link flow) →
     attach the identity to `current_user`.
  3. No identity, not signed in, the provider asserts a **verified** email
     matching an existing `User#email` → link and sign in. If that user's own
     email was never verified (an unconfirmed password signup), the provider
     just proved ownership of the address — link it, set
     `email_verified_at`, and clear `password_digest` (the unproven password
     could belong to whoever registered that address first, not its real
     owner; they can set a new one from Account settings).
  4. Otherwise → create a new `User` (`Users::Provision` fires via
     `User#after_create`, same as any other creation path) and link.
  Never links by an email the provider didn't mark as verified. Google
  asserts `email_verified`; **Strava never asserts an email at all**, so it
  can only ever reach branches 1, 2, or 4 — never 3.
- **Strava is both a sign-in method and the data connection** — one OAuth
  grant does both, decided by whether a session user existed going into
  `StravaController#callback` (see "Strava integration" above for the
  route/state details). The resulting `StravaCredential` attaches to
  whichever user `Auth::ResolveIdentity` resolves to, never blindly to
  `current_user`. A connect (already signed in) redirects back to
  `/strava?connected=1`; a fresh sign-in has nowhere Strava-specific to go,
  so it lands on `/`.
- **Google** is deferred — the identity-linking model and `Auth::ResolveIdentity`
  are already provider-agnostic and ready for it, but it needs a real OAuth
  client id/secret from the Google Cloud Console (`bin/rails
  credentials:edit`, a `google:` key) before the OmniAuth wiring,
  `Auth::OmniauthCallbacksController`, and the "Continue with Google" button
  are worth adding. Apple is deferred further still (see "Not building yet"
  below) but the schema already accommodates it — `UserIdentity#provider`
  includes `"apple"`.
- **`rails "users:claim[email@example.com]"`** (`lib/tasks/users.rake`) gives
  the pre-auth seed user (created by
  `20261013224709_add_user_to_ownership_tables.rb`, back when the app was
  single-user with no real accounts) a real, verified email, and links its
  `StravaCredential` as a sign-in identity if it has one. Run once, early.
  The seed user is found as "the one user with no verified email, no
  password, and no linked identity" — `password_digest: nil` specifically is
  what keeps this from accidentally matching an ordinary unverified
  email/password signup, which looks identical under the other two
  conditions (the seed user predates `has_secure_password` and has never had
  a password set; a real registrant always does).
- **Mailer**: `UserMailer#password_reset`/`#email_verification`, plain text
  views, caught by `letter_opener_web` (mounted at `/letter_opener`) in
  development instead of a real delivery service. Production's delivery
  method (Postmark, SES, etc.) is a deliberately deferred config choice, not
  picked yet. `lib/frontend.rb`'s `Frontend.url(path)` is the one place that
  knows the frontend's base URL (`ENV["FRONTEND_URL"]`, default
  `http://localhost:5173`) — used by the mailer views and by
  `StravaController`'s redirects alike.
- **Password reset / email verification tokens** use Rails 7.1's
  `generates_token_for` on `User` — `:password_reset` (20 min, keyed off
  `password_salt`, so the token dies the instant the password changes any
  other way) and `:email_verification` (1 day, keyed off `email`, so
  changing the email kills an outstanding token) — no token storage or
  revocation of our own needed.
- **Required environment**: `FRONTEND_URL` (defaults to
  `http://localhost:5173` in development); `strava:`/`google:` keys in
  `config/credentials.yml.enc` (Strava already set up; Google not yet — see
  above); a real `config.action_mailer.delivery_method` in production (not
  chosen yet).

**Not building yet (deployment notes for when this app is actually deployed):**
- **Same-site cookies need a shared registrable domain.** The `SameSite=Lax`
  session cookie only works if the frontend and API share one, e.g.
  `app.example.com` + `api.example.com` — two hosts on a platform's shared
  domain (`*.onrender.com`, `*.fly.dev`) count as different sites and won't
  receive the cookie. Deploy on a custom domain, or serve both from one
  service.
- **Strava's new-API-app athlete cap.** A new Strava API app only allows its
  owner's account until raised; up to 10 athletes is a self-serve change in
  Strava's API settings, beyond that needs Strava's review. Check before
  inviting anyone else to sign in with Strava.
- **Apple**, when it's worth the paid developer account: add
  `omniauth-apple`. Apple POSTs back to the callback cross-site
  (`response_mode=form_post`), so the session cookie isn't sent on that
  request — carry `state`/`nonce` in a short-lived `SameSite=None; Secure`
  cookie instead, or use the gem's documented workaround. Apple returns the
  user's name only on first authorization, and the email may be a private
  relay address — both already fine under `Auth::ResolveIdentity`'s rules
  above.

