require "rails_helper"

RSpec.describe TableViewPreference, type: :model do
  it "is valid with a user and table_key" do
    expect(build(:table_view_preference)).to be_valid
  end

  it "is invalid without a table_key" do
    preference = build(:table_view_preference, table_key: nil)

    expect(preference).not_to be_valid
    expect(preference.errors[:table_key]).to be_present
  end

  it "is invalid with a duplicate table_key for the same user" do
    user = create(:user)
    create(:table_view_preference, user: user, table_key: "bikes")
    duplicate = build(:table_view_preference, user: user, table_key: "bikes")

    expect(duplicate).not_to be_valid
  end

  it "allows the same table_key for different users" do
    create(:table_view_preference, table_key: "bikes")
    other_user_preference = build(:table_view_preference, table_key: "bikes")

    expect(other_user_preference).to be_valid
  end

  it "is invalid when data is not a hash" do
    preference = build(:table_view_preference)
    preference.data = ["not", "a", "hash"]

    expect(preference).not_to be_valid
    expect(preference.errors[:data]).to be_present
  end

  describe "group_by" do
    it "accepts each list's own values" do
      expect(build(:table_view_preference, table_key: "activity_log", data: { "group_by" => "week" })).to be_valid
      %w[category bike none].each do |value|
        expect(build(:table_view_preference, table_key: "components", data: { "group_by" => value })).to be_valid
      end
    end

    it "rejects another list's value" do
      expect(build(:table_view_preference, table_key: "components", data: { "group_by" => "week" })).not_to be_valid
      expect(build(:table_view_preference, table_key: "activity_log", data: { "group_by" => "category" })).not_to be_valid
    end

    it "doesn't check table keys that don't group" do
      expect(build(:table_view_preference, table_key: "bikes", data: { "group_by" => "anything" })).to be_valid
    end
  end
end
