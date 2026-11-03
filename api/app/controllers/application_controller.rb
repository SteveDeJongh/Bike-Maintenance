class ApplicationController < ActionController::API
  include ActionController::Cookies
  include ActionController::RequestForgeryProtection

  protect_from_forgery with: :exception

  # Including RequestForgeryProtection here creates its own
  # allow_forgery_protection class_attribute with a fresh `true` default,
  # shadowing whatever ActionController::API already inherited from
  # config.action_controller.allow_forgery_protection (test.rb sets this to
  # false) -- forward it explicitly so the test environment's setting
  # actually takes effect.
  configured_forgery_protection = Rails.application.config.action_controller.allow_forgery_protection
  self.allow_forgery_protection = configured_forgery_protection unless configured_forgery_protection.nil?

  before_action :require_authentication

  def current_user
    @current_user ||= User.find_by(id: session[:user_id])
  end

  private

  def require_authentication
    render json: { base: ["Not authenticated"] }, status: :unauthorized unless current_user
  end
end
