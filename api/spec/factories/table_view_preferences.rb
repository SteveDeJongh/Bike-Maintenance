FactoryBot.define do
  factory :table_view_preference do
    user
    table_key { "bikes" }
    data { {} }
  end
end
