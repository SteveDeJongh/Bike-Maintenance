class ActivityController < ApplicationController
  # GET /activity
  def index
    result = Activity::Feed.call(
      current_user,
      kinds: Array(params[:kinds]),
      bike_id: params[:bike_id],
      from: params[:from],
      to: params[:to],
      tz: params[:tz],
      q: params[:q],
      component_id: params[:component_id],
      order: params[:order],
      sort: params[:sort],
      cursor: params[:cursor],
      page: params[:page],
      per_page: params[:per_page],
    )

    render json: { items: result.items, meta: result.meta, next_cursor: result.next_cursor }
  rescue Activity::Feed::InvalidSortError => e
    render json: { base: [ e.message ] }, status: :unprocessable_content
  end
end
