class Auth::SessionsController < ApplicationController
  include UserSerialization

  skip_before_action :require_authentication, only: %i[create destroy]

  def create
    user = User.find_by(email: params[:email]&.strip&.downcase)

    if user&.authenticate(params[:password])
      reset_session
      session[:user_id] = user.id
      render json: user_json(user)
    else
      render json: { base: ["Incorrect email or password"] }, status: :unauthorized
    end
  end

  def destroy
    reset_session
    head :no_content
  end
end
