class ApplicationMailer < ActionMailer::Base
  default from: ENV.fetch("MAILER_FROM", "notifications@example.invalid")
  layout "mailer"
end
