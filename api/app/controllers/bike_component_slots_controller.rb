class BikeComponentSlotsController < ApplicationController
  before_action :set_bike_component_slot, only: %i[ destroy ]

  # POST /bike_component_slots
  def create
    bike = current_user.bikes.find(bike_component_slot_params[:bike_id])
    @bike_component_slot = bike.bike_component_slots.new(category: bike_component_slot_params[:category])

    if @bike_component_slot.save
      render json: @bike_component_slot, status: :created
    else
      render json: @bike_component_slot.errors, status: :unprocessable_content
    end
  end

  # DELETE /bike_component_slots/1
  def destroy
    if @bike_component_slot.destroy
      head :no_content
    else
      render json: @bike_component_slot.errors, status: :unprocessable_content
    end
  end

  private
    def set_bike_component_slot
      @bike_component_slot = current_user.bike_component_slots.find(params[:id])
    end

    def bike_component_slot_params
      params.require(:bike_component_slot).permit(:bike_id, :category)
    end
end
