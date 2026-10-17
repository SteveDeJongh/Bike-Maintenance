class ComponentCategorySettingsController < ApplicationController
  # GET /component_category_settings
  def index
    render json: current_user.component_category_settings
  end

  # PATCH/PUT /component_category_settings/:category
  def update
    setting = current_user.component_category_settings.find_or_initialize_by(category: params[:category])

    if setting.update(component_category_setting_params)
      render json: setting
    else
      render json: setting.errors, status: :unprocessable_content
    end
  end

  private
    def component_category_setting_params
      params.require(:component_category_setting).permit(:accrues_indoor_mileage)
    end
end
