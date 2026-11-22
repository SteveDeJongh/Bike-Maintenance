require "rails_helper"
require Rails.root.join("db/migrate/20261122200000_add_rotates_to_component_category_settings.rb").to_s

RSpec.describe AddRotatesToComponentCategorySettings do
  let(:migration) { described_class.new.tap { |m| m.verbose = false } }

  after { ComponentCategorySetting.reset_column_information }

  it "backfills rotates true for every existing user's chain row, false for everything else" do
    users = create_list(:user, 2)
    create(:component_category_setting, user: users.first, category: "fenders")

    # Drop the column with the rows in place, so #up runs its real
    # add-and-backfill against existing users (the spec's transaction
    # rolls the DDL back afterwards).
    migration.down
    migration.up
    ComponentCategorySetting.reset_column_information

    users.each do |user|
      user.component_category_settings.each do |setting|
        expect(setting.rotates).to eq(setting.category == "chain"), "#{setting.category} for user #{user.id}"
      end
    end
  end
end
