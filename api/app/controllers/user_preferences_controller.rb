class UserPreferencesController < ApplicationController
  # GET /user_preferences
  def show
    render json: { bike_list_preferences: current_user.bike_list_preferences }
  end

  # PATCH/PUT /user_preferences
  def update
    if current_user.update(user_preferences_params)
      render json: { bike_list_preferences: current_user.bike_list_preferences }
    else
      render json: current_user.errors, status: :unprocessable_content
    end
  end

  private
    def user_preferences_params
      params.require(:user_preferences).permit(bike_list_preferences: {})
    end
end
