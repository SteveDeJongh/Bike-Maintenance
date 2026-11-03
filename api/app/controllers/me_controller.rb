class MeController < ApplicationController
  include UserSerialization

  def show
    render json: user_json(current_user)
  end
end
