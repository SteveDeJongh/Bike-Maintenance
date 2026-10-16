class TableViewPreferencesController < ApplicationController
  # GET /table_view_preferences/:table_key
  def show
    preference = current_user.table_view_preferences.find_by(table_key: params[:table_key])
    render json: { data: preference&.data || {} }
  end

  # PATCH/PUT /table_view_preferences/:table_key
  def update
    preference = current_user.table_view_preferences.find_or_initialize_by(table_key: params[:table_key])

    if preference.update(table_view_preference_params)
      render json: { data: preference.data }
    else
      render json: preference.errors, status: :unprocessable_content
    end
  end

  private
    def table_view_preference_params
      params.require(:table_view_preference).permit(data: {})
    end
end
