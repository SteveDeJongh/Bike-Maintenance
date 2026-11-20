require "rails_helper"
require Rails.root.join("db/migrate/20261120200001_backfill_service_type_categories.rb").to_s

# Proves the data migration's tagging rules directly against real rows.
RSpec.describe BackfillServiceTypeCategories do
  let(:user) { create(:user) }

  def run_migration
    ServiceTypeCategory.delete_all
    migrate_up
  end

  def migrate_up
    migration = described_class.new
    migration.suppress_messages { migration.up }
  end

  def tags_of(type)
    ServiceTypeCategory.where(service_type: type).pluck(:category).sort
  end

  def event_on(category, type)
    create(:maintenance_event, component: create(:component, user: user, category: category), service_type: type)
  end

  it "tags a type with every template category and custom-requirement component category that uses it" do
    hot_wax = create(:service_type, user: user, name: "Hot wax")
    create(:category_service_requirement, user: user, category: "chain", service_type: hot_wax)
    create(:category_service_requirement, user: user, category: "cassette", service_type: hot_wax)
    create(:component_service_requirement, component: create(:component, user: user, category: "chainring"), service_type: hot_wax)

    run_migration

    expect(tags_of(hot_wax)).to eq(%w[cassette chain chainring])
  end

  it "falls back to event categories only when no satisfier tagged the type" do
    sealant = create(:service_type, user: user, name: "Sealant top-up")
    event_on("tire_front", sealant)
    event_on("tire_rear", sealant)

    lube = create(:service_type, user: user, name: "Lube")
    create(:category_service_requirement, user: user, category: "chain", service_type: lube)
    event_on("cassette", lube)

    run_migration

    expect(tags_of(sealant)).to eq(%w[tire_front tire_rear])
    expect(tags_of(lube)).to eq(%w[chain])
  end

  it "leaves the generic inspect/clean/replace types untagged, case-insensitively" do
    # Users::Provision already seeded these for the user; give each real use
    # (a satisfier and an event), and shout one name to prove the match is
    # case-insensitive.
    generic = user.service_types.where("lower(name) IN ('inspect', 'clean', 'replace')").to_a
    expect(generic.size).to eq(3)
    generic.first.update!(name: generic.first.name.upcase)
    generic.each do |type|
      create(:category_service_requirement, user: user, category: "chain", service_type: type)
      event_on("cassette", type)
    end

    run_migration

    generic.each { |type| expect(tags_of(type)).to be_empty }
  end

  it "leaves a type with no satisfiers and no events untagged" do
    unused = create(:service_type, user: user, name: "Bearing repack")

    run_migration

    expect(tags_of(unused)).to be_empty
  end

  it "is idempotent" do
    hot_wax = create(:service_type, user: user, name: "Hot wax")
    create(:category_service_requirement, user: user, category: "chain", service_type: hot_wax)
    run_migration

    expect { migrate_up }.not_to change(ServiceTypeCategory, :count)
  end
end
