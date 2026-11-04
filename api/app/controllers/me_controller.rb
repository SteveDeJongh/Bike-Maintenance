class MeController < ApplicationController
  include UserSerialization

  def show
    render json: user_json(current_user)
  end

  def update
    email_changing = me_params.key?(:email)
    current_user.assign_attributes(me_params)
    current_user.email_verified_at = nil if email_changing && current_user.email_changed?

    if current_user.save
      if current_user.saved_change_to_email? && current_user.email.present?
        UserMailer.email_verification(current_user).deliver_later
      end
      render json: user_json(current_user)
    else
      render json: current_user.errors, status: :unprocessable_content
    end
  end

  # A password-less (Google/Strava-only) user has nothing to confirm with
  # beyond their already-authenticated session; one with a password must
  # re-enter it.
  def destroy
    if current_user.has_password? && !current_user.authenticate(params[:password])
      return render json: { base: ["Password is incorrect"] }, status: :unauthorized
    end

    current_user.destroy!
    reset_session
    head :no_content
  end

  private

  def me_params
    params.require(:user).permit(:name, :email)
  end
end
