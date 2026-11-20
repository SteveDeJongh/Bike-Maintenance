class BackfillServiceTypeCategories < ActiveRecord::Migration[7.1]
  # Raw SQL, no models -- frozen against whatever the models later become.
  #
  # 1. Tag each service type with every category that uses it as a satisfier:
  #    a CategoryServiceRequirement template's own category, plus the
  #    component category of a custom (unlinked) ComponentServiceRequirement.
  # 2. Only for types step 1 tagged nothing: fall back to the categories of
  #    components the type has MaintenanceEvents on.
  # Types named inspect/clean/replace (case-insensitively, the seeded generic
  # types) stay untagged = universal, as does any type with neither.
  GENERIC_NAMES = "('inspect', 'clean', 'replace')".freeze

  def up
    execute <<~SQL
      INSERT INTO service_type_categories (service_type_id, category, created_at, updated_at)
      SELECT DISTINCT st.id, used.category, NOW(), NOW()
      FROM service_types st
      JOIN (
        SELECT s.service_type_id, csr.category
        FROM service_requirement_satisfiers s
        JOIN category_service_requirements csr
          ON s.owner_type = 'CategoryServiceRequirement' AND csr.id = s.owner_id
        UNION
        SELECT s.service_type_id, c.category
        FROM service_requirement_satisfiers s
        JOIN component_service_requirements r
          ON s.owner_type = 'ComponentServiceRequirement' AND r.id = s.owner_id
          AND r.category_service_requirement_id IS NULL
        JOIN components c ON c.id = r.component_id
      ) used ON used.service_type_id = st.id
      WHERE lower(st.name) NOT IN #{GENERIC_NAMES}
      ON CONFLICT (service_type_id, category) DO NOTHING
    SQL

    execute <<~SQL
      INSERT INTO service_type_categories (service_type_id, category, created_at, updated_at)
      SELECT DISTINCT st.id, c.category, NOW(), NOW()
      FROM service_types st
      JOIN maintenance_events me ON me.service_type_id = st.id
      JOIN components c ON c.id = me.component_id
      WHERE lower(st.name) NOT IN #{GENERIC_NAMES}
        AND NOT EXISTS (SELECT 1 FROM service_type_categories stc WHERE stc.service_type_id = st.id)
      ON CONFLICT (service_type_id, category) DO NOTHING
    SQL
  end

  def down
    execute "DELETE FROM service_type_categories"
  end
end
