require "rails_helper"

RSpec.describe Maintenance::LatestServiceQuery do
  let(:user) { create(:user) }

  it "returns each component's most recent event with its service type name" do
    chain = create(:component, user: user, category: "chain")
    bare = create(:component, user: user, category: "saddle")
    wax = create(:service_type, user: user, name: "Waxed")
    clean = create(:service_type, user: user, name: "Cleaned")
    create(:maintenance_event, component: chain, service_type: clean, performed_at: Time.zone.local(2026, 1, 1))
    create(:maintenance_event, component: chain, service_type: wax, performed_at: Time.zone.local(2026, 3, 1))
    create(:maintenance_event, component: chain, service_type: clean, performed_at: Time.zone.local(2026, 2, 1))

    result = described_class.call(user)

    expect(result[chain.id]).to eq(service_type_name: "Waxed", performed_at: Time.zone.local(2026, 3, 1))
    expect(result).not_to have_key(bare.id)
  end

  it "prefers the later-created event on a performed_at tie" do
    chain = create(:component, user: user, category: "chain")
    at = Time.zone.local(2026, 3, 1)
    create(:maintenance_event, component: chain, service_type: create(:service_type, user: user, name: "First"), performed_at: at)
    create(:maintenance_event, component: chain, service_type: create(:service_type, user: user, name: "Second"), performed_at: at)

    expect(described_class.call(user)[chain.id][:service_type_name]).to eq("Second")
  end

  it "limits to the given component_ids and ignores another user's components" do
    mine = create(:component, user: user)
    skipped = create(:component, user: user)
    other = create(:component)
    [ mine, skipped, other ].each { |c| create(:maintenance_event, component: c) }

    result = described_class.call(user, component_ids: [ mine.id, skipped.id, other.id ].without(skipped.id))

    expect(result.keys).to eq([ mine.id ])
  end
end
