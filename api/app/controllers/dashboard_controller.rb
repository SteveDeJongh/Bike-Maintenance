class DashboardController < ApplicationController
  # GET /dashboard
  def index
    render json: Dashboard::Summary.call(current_user, tz: params[:tz])
  end
end
