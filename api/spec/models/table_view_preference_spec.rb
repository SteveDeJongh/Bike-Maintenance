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
end
