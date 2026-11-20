class ServiceTypesController < ApplicationController
  before_action :set_service_type, only: %i[ show update destroy ]

  # GET /service_types
  # Tags and usage counts come from three batched queries total, however
  # many types there are -- never one per type.
  def index
    types = current_user.service_types.order(:id).to_a
    render json: serialize_all(types)
  end

  # GET /service_types/1
  def show
    render json: serialize_all([@service_type]).first
  end

  # POST /service_types
  # Accepts categories: [...] -- the inline-create paths send the picker's
  # own category as categories: [category]; Settings sends [] (universal).
  def create
    @service_type = current_user.service_types.new(service_type_params)

    if save_with_categories(@service_type)
      render json: serialize_all([@service_type]).first, status: :created
    else
      render json: @service_type.errors, status: :unprocessable_content
    end
  end

  # PATCH/PUT /service_types/1
  # categories: [...] replaces the full tag set ([] = universal); omitting
  # the key leaves the tags as they are.
  def update
    @service_type.assign_attributes(service_type_params)

    if save_with_categories(@service_type)
      render json: serialize_all([@service_type]).first
    else
      render json: @service_type.errors, status: :unprocessable_content
    end
  end

  # DELETE /service_types/1
  def destroy
    if @service_type.destroy
      head :no_content
    else
      render json: @service_type.errors, status: :unprocessable_content
    end
  end

  private
    def set_service_type
      @service_type = current_user.service_types.find(params[:id])
    end

    def service_type_params
      params.require(:service_type).permit(:name)
    end

    # nil when the request didn't send categories at all (leave tags alone).
    def categories_param
      return nil unless params[:service_type].respond_to?(:key?) && params[:service_type].key?(:categories)

      Array(params[:service_type][:categories])
    end

    def save_with_categories(service_type)
      categories = categories_param

      ActiveRecord::Base.transaction do
        raise ActiveRecord::Rollback unless service_type.save

        service_type.replace_categories!(categories) unless categories.nil?
        true
      end
    end

    def serialize_all(types)
      ids = types.map(&:id)
      tags = ServiceTypeCategory.where(service_type_id: ids).order(:category).pluck(:service_type_id, :category)
        .group_by(&:first).transform_values { |pairs| pairs.map(&:last) }
      # Satisfiers are unique per (owner, service type), so this count is the
      # number of distinct requirements (templates + custom rows) the type
      # satisfies. Linked component rows inherit their template's
      # satisfiers and aren't counted again.
      requirement_counts = ServiceRequirementSatisfier.where(service_type_id: ids).group(:service_type_id).count
      event_counts = MaintenanceEvent.where(service_type_id: ids).group(:service_type_id).count

      types.map do |type|
        {
          id: type.id,
          name: type.name,
          categories: tags.fetch(type.id, []),
          requirement_count: requirement_counts.fetch(type.id, 0),
          event_count: event_counts.fetch(type.id, 0),
        }
      end
    end
end
