class Auth::RegistrationsController < ApplicationController
  include UserSerialization

  skip_before_action :require_authentication, only: :create

  def create
    # The model itself allows a blank email/password (a Google/Strava-only
    # user has neither), but registering through this endpoint specifically
    # means signing up with both.
    return render json: { email: ["is required"] }, status: :unprocessable_content if registration_params[:email].blank?
    return render json: { password: ["is required"] }, status: :unprocessable_content if registration_params[:password].blank?

    user = User.new(registration_params)

    if user.save
      reset_session
      session[:user_id] = user.id
      UserMailer.email_verification(user).deliver_later
      render json: user_json(user), status: :created
    else
      render json: user.errors, status: :unprocessable_content
    end
  end

  private

  def registration_params
    params.require(:user).permit(:name, :email, :password)
  end
end
