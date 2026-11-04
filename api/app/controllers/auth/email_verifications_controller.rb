class Auth::EmailVerificationsController < ApplicationController
  include UserSerialization

  skip_before_action :require_authentication, only: :verify

  def verify
    user = User.find_by_token_for(:email_verification, params[:token])
    unless user
      return render json: { base: ["That verification link is invalid or has expired"] }, status: :unprocessable_content
    end

    user.update!(email_verified_at: Time.current)
    reset_session
    session[:user_id] = user.id
    render json: user_json(user)
  end

  def resend
    return head :ok if current_user.email_verified_at.present? || current_user.email.blank?

    UserMailer.email_verification(current_user).deliver_later
    head :ok
  end
end
