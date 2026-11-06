class ComponentCategorySettingsController < ApplicationController
  # GET /component_category_settings
  def index
    render json: current_user.component_category_settings, methods: [:brand_list_partner]
  end

  # PATCH/PUT /component_category_settings/:category
  def update
    attrs = component_category_setting_params.to_h
    brands = attrs.delete("common_brands")

    setting = current_user.component_category_settings.find_or_initialize_by(category: params[:category])
    success = true

    # common_brands goes through UpdateCommonBrands (mirrors to a paired
    # partner); everything else keeps the plain non-bang update. Both run in
    # one transaction so an invalid attrs value rolls back the brand-list
    # write too, rather than leaving a pair half-synced.
    ActiveRecord::Base.transaction do
      setting = ComponentCategorySettings::UpdateCommonBrands.call(
        user: current_user, category: params[:category], brands: brands,
      ) if brands

      if attrs.present?
        success = setting.update(attrs)
        raise ActiveRecord::Rollback unless success
      end
    end

    if success
      render json: setting, methods: [:brand_list_partner]
    else
      render json: setting.errors, status: :unprocessable_content
    end
  end

  private
    def component_category_setting_params
      params.require(:component_category_setting).permit(
        :default_ride_context, :trackable, :allows_multiple_assignments,
        :notifications_enabled, :warning_threshold_percent,
        common_brands: [],
      )
    end
end
