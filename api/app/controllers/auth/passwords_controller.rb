class Auth::PasswordsController < ApplicationController
  include UserSerialization

  skip_before_action :require_authentication, only: %i[forgot reset]

  # Always 200, regardless of whether the email matches an account -- never
  # reveals which addresses are registered. Works even for a Google/Strava-
  # only user (has no password yet); following the link lets them set one.
  def forgot
    user = params[:email].present? ? User.find_by(email: params[:email]) : nil
    UserMailer.password_reset(user).deliver_later if user
    head :ok
  end

  def reset
    user = User.find_by_token_for(:password_reset, params[:token])
    return render_invalid_token unless user
    return render_password_required if params[:password].blank?

    if user.update(password: params[:password])
      reset_session
      session[:user_id] = user.id
      render json: user_json(user)
    else
      render json: user.errors, status: :unprocessable_content
    end
  end

  # PUT /me/password -- set (no password yet) or change (requires the
  # current one) while already signed in.
  def update
    if current_user.has_password? && !current_user.authenticate(params[:current_password])
      return render json: { base: ["Current password is incorrect"] }, status: :unauthorized
    end
    return render_password_required if params[:password].blank?

    if current_user.update(password: params[:password])
      render json: user_json(current_user)
    else
      render json: current_user.errors, status: :unprocessable_content
    end
  end

  private

  def render_invalid_token
    render json: { base: ["That reset link is invalid or has expired"] }, status: :unprocessable_content
  end

  def render_password_required
    render json: { password: ["is required"] }, status: :unprocessable_content
  end
end
