namespace :components do
  desc "Read-only: list retired components whose assignments are still open or end after retired_on. Changes nothing."
  task audit_retired_mounted: :environment do
    rows = Components::RetiredMountedAudit.call
    if rows.empty?
      puts "None found."
      next
    end

    puts "#{rows.size} assignment(s) contradict retired_on (day boundaries in #{Time.zone.name}):"
    rows.each do |row|
      ended = row.ended_at ? row.ended_at.iso8601 : "open"
      puts [
        "user #{row.user_id}", "component #{row.component_id} #{row.label.inspect}", "retired_on #{row.retired_on}",
        "assignment #{row.assignment_id} on #{row.bike_name.inspect}", "#{row.started_at.iso8601} -> #{ended}", row.reason,
      ].join(" | ")
    end
  end
end
