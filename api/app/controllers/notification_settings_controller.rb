class NotificationSettingsController < ApplicationController
  # GET /notification_settings
  # A singleton per user -- returns the hardcoded defaults (unsaved,
  # matching the column defaults) when the user has no row yet, so the
  # frontend never has to special-case "missing".
  def show
    render json: current_user.notification_setting || current_user.build_notification_setting
  end

  # PATCH /notification_settings
  def update
    setting = current_user.notification_setting || current_user.build_notification_setting

    if setting.update(notification_setting_params)
      render json: setting
    else
      render json: setting.errors, status: :unprocessable_content
    end
  end

  private
    def notification_setting_params
      params.require(:notification_setting).permit(:notifications_enabled, :warning_threshold_percent)
    end
end
