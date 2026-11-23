# Strava's push subscription callback (docs/strava.md, "Webhooks"). Strava
# has no user session and sends no CSRF token, so this lives apart from
# StravaController and skips both. Events aren't signed: receive trusts the
# payload only as "something changed for athlete X / activity Y" and leaves
# every lookup and Strava call to StravaWebhookEventJob, so it answers well
# inside Strava's 2-second limit (a non-200 just makes Strava retry).
class StravaWebhooksController < ApplicationController
  skip_before_action :require_authentication
  skip_forgery_protection
  # Read the event's fields from the top level only.
  wrap_parameters false

  EVENT_FIELDS = %i[object_type object_id aspect_type owner_id subscription_id event_time].freeze
  REQUIRED_FIELDS = %i[object_type object_id aspect_type owner_id].freeze

  # GET /strava/webhook -- the subscription's validation request:
  # ?hub.mode=subscribe&hub.challenge=...&hub.verify_token=...
  def verify
    expected = webhook_config[:webhook_verify_token].to_s
    given = params["hub.verify_token"].to_s

    if expected.present? && params["hub.mode"] == "subscribe" &&
        ActiveSupport::SecurityUtils.secure_compare(given, expected)
      render json: { "hub.challenge" => params["hub.challenge"] }
    else
      Rails.logger.warn("[StravaWebhook] rejected a validation request (mode=#{params['hub.mode'].inspect})")
      head :forbidden
    end
  end

  # POST /strava/webhook -- one event.
  def receive
    event = params.permit(*EVENT_FIELDS, updates: {}).to_h
    summary = "#{event[:object_type]}/#{event[:aspect_type]} object=#{event[:object_id]} " \
      "owner=#{event[:owner_id]} subscription=#{event[:subscription_id]}"

    if REQUIRED_FIELDS.any? { |field| event[field].blank? }
      Rails.logger.warn("[StravaWebhook] malformed event: #{summary}")
      return head :bad_request
    end

    expected_subscription = webhook_config[:webhook_subscription_id]
    if expected_subscription.present? && event[:subscription_id].to_s != expected_subscription.to_s
      Rails.logger.warn("[StravaWebhook] ignored event for another subscription: #{summary}")
      return head :ok
    end

    Rails.logger.info("[StravaWebhook] received #{summary} updates=#{event[:updates].to_h.inspect}")
    StravaWebhookEventJob.perform_later(event)
    head :ok
  end

  private

  def webhook_config
    Rails.application.credentials.strava || {}
  end
end
