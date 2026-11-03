class Auth::RegistrationsController < ApplicationController
  include UserSerialization

  skip_before_action :require_authentication, only: :create

  def create
    user = User.new(registration_params)

    if user.save
      reset_session
      session[:user_id] = user.id
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
