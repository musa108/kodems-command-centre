# Entity relationship diagrams

> Generated from `apps/api/prisma/schema.prisma` by `npm -w apps/api run db:erd`. Do not edit by hand.
> PostGIS `geom` columns (incidents, incident_reports, shelters, warehouses, response_teams, geographic_boundaries) are added by migration `0002` and are not modelled in Prisma.

## Identity & access

```mermaid
erDiagram
  users {
    String id PK
    String email
    String name
    String phone
    String passwordHash
    Boolean isActive
    Boolean mfaEnabled
    String mfaSecret
    Int failedLogins
    DateTime lockedUntil
    DateTime lastLoginAt
    Boolean isDemo
  }
  roles {
    String id PK
    String key
    String name
    String description
    Boolean isSystem
    Boolean scopeRequired
    Boolean mfaRequired
  }
  permissions {
    String id PK
    String key
    String description
  }
  user_roles {
    String userId
    String roleId
  }
  role_permissions {
    String roleId
    String permissionId
  }
  user_scopes {
    String userId
    String lgaId
  }
  sessions {
    String id PK
    String userId
    String refreshHash
    String userAgent
    String ip
    DateTime expiresAt
    DateTime revokedAt
    DateTime createdAt
  }
  password_reset_tokens {
    String id PK
    String userId
    String tokenHash
    DateTime expiresAt
    DateTime usedAt
    DateTime createdAt
  }
  users ||--o{ user_roles : "user"
  roles ||--o{ user_roles : "role"
  roles ||--o{ role_permissions : "role"
  permissions ||--o{ role_permissions : "permission"
  users ||--o{ user_scopes : "user"
  users ||--o{ sessions : "user"
  users ||--o{ password_reset_tokens : "user"
```

## Geography

```mermaid
erDiagram
  lgas {
    String id PK
    String name
    String code
    String source
  }
  wards {
    String id PK
    String lgaId
    String name
    String code
  }
  communities {
    String id PK
    String lgaId
    String wardId
    String name
    Float lat
    Float lng
  }
  geographic_boundaries {
    String id PK
    String kind
    String refId
    String name
    String source
    Boolean isPlaceholder
    DateTime importedAt
  }
  ref_categories {
    String id PK
    CategoryKind kind
    String key
    String label
    Boolean active
  }
  lgas ||--o{ wards : "lga"
  lgas ||--o{ communities : "lga"
  wards |o--o{ communities : "ward"
```

## Reports & incidents

```mermaid
erDiagram
  incident_reports {
    String id PK
    String ref
    String categoryId
    String description
    String reporterName
    String reporterPhone
    DateTime incidentAt
    DateTime submittedAt
    Float lat
    Float lng
    String lgaId
    String ward
  }
  report_media {
    String id PK
    String reportId
    String storageKey
    String mime
    Int size
    DateTime createdAt
  }
  report_notes {
    String id PK
    String reportId
    String authorId
    String body
    DateTime createdAt
  }
  report_status_history {
    String id PK
    String reportId
    ReportStatus from
    ReportStatus to
    String actorId
    String reason
    DateTime at
  }
  incidents {
    String id PK
    String ref
    String title
    String description
    String categoryId
    Severity severity
    IncidentStatus status
    Float lat
    Float lng
    String lgaId
    String ward
    String community
  }
  incident_report_links {
    String incidentId
    String reportId
    DateTime linkedAt
    String linkedById
  }
  incident_updates {
    String id PK
    String incidentId
    UpdateType type
    String body
    Json meta
    String authorId
    DateTime at
  }
  incident_media {
    String id PK
    String incidentId
    String storageKey
    String mime
    Int size
    String uploadedById
    DateTime createdAt
  }
  incident_status_history {
    String id PK
    String incidentId
    IncidentStatus from
    IncidentStatus to
    String actorId
    String reason
    DateTime at
  }
  incident_assignments {
    String id PK
    String incidentId
    String role
    String userId
    String assignedById
    DateTime at
  }
  incident_reports ||--o{ report_media : "report"
  incident_reports ||--o{ report_notes : "report"
  incident_reports ||--o{ report_status_history : "report"
  incidents ||--o{ incident_report_links : "incident"
  incident_reports ||--o{ incident_report_links : "report"
  incidents ||--o{ incident_updates : "incident"
  incidents ||--o{ incident_media : "incident"
  incidents ||--o{ incident_status_history : "incident"
  incidents ||--o{ incident_assignments : "incident"
```

## Response operations

```mermaid
erDiagram
  response_teams {
    String id PK
    String code
    String name
    String categoryId
    String agency
    String lgaId
    Float baseLat
    Float baseLng
    String contact
    TeamStatus status
    Float lastLat
    Float lastLng
  }
  team_members {
    String id PK
    String teamId
    String name
    String phone
    String role
    Boolean isLeader
    Boolean active
  }
  team_capabilities {
    String id PK
    String teamId
    String name
  }
  team_equipment {
    String id PK
    String teamId
    String name
    Int quantity
    String condition
  }
  vehicles {
    String id PK
    String teamId
    String plate
    String type
    String status
  }
  deployments {
    String id PK
    String ref
    String incidentId
    String teamId
    String assignedById
    String destination
    Severity priority
    String instructions
    String requiredResources
    DeploymentStatus status
    DateTime assignedAt
    DateTime acceptedAt
  }
  deployment_updates {
    String id PK
    String deploymentId
    String kind
    String message
    Float lat
    Float lng
    String authorId
    String idempotencyKey
    DateTime at
  }
  deployment_status_history {
    String id PK
    String deploymentId
    DeploymentStatus from
    DeploymentStatus to
    String actorId
    String reason
    DateTime at
  }
  response_teams ||--o{ team_members : "team"
  response_teams ||--o{ team_capabilities : "team"
  response_teams ||--o{ team_equipment : "team"
  response_teams ||--o{ vehicles : "team"
  response_teams ||--o{ deployments : "team"
  deployments ||--o{ deployment_updates : "deployment"
  deployments ||--o{ deployment_status_history : "deployment"
```

## Affected population

```mermaid
erDiagram
  affected_households {
    String id PK
    String ref
    String headName
    String incidentId
    String lgaId
    String ward
    String community
    Float lat
    Float lng
    Int size
    DamageLevel damage
    DisplacementStatus displacement
  }
  affected_persons {
    String id PK
    String ref
    String householdId
    String name
    String ageBand
    String sex
    String relationship
    DisplacementStatus displacement
    String assistanceNeeds
    DateTime registeredAt
  }
  household_needs {
    String id PK
    String householdId
    String need
  }
  damage_assessments {
    String id PK
    String incidentId
    String householdId
    DamageLevel level
    String description
    String assessedById
    DateTime at
  }
  beneficiaries {
    String id PK
    String ref
    String name
    String phone
    String householdId
    DateTime createdAt
  }
  affected_households ||--o{ affected_persons : "household"
  affected_households ||--o{ household_needs : "household"
  affected_households |o--o{ damage_assessments : "household"
  affected_households |o--o{ beneficiaries : "household"
```

## Relief & shelters

```mermaid
erDiagram
  relief_items {
    String id PK
    String sku
    String name
    String categoryId
    String unit
    Boolean active
  }
  warehouses {
    String id PK
    String code
    String name
    String lgaId
    Float lat
    Float lng
    String contactPerson
    String contactPhone
    String capacity
    WarehouseStatus status
    Boolean isDemo
  }
  inventory_transactions {
    String id PK
    String warehouseId
    String itemId
    InventoryTxType type
    Int delta
    String reference
    String reason
    String allocationId
    String distributionId
    String transferGroup
    String idempotencyKey
    String createdById
  }
  relief_allocations {
    String id PK
    String ref
    String incidentId
    String warehouseId
    String targetArea
    AllocationStatus status
    String requestedById
    String approvedById
    String decisionNote
    DateTime approvedAt
    Boolean isDemo
    Int version
  }
  allocation_items {
    String id PK
    String allocationId
    String itemId
    Int quantity
  }
  relief_distributions {
    String id PK
    String ref
    String allocationId
    String beneficiaryId
    String distributedById
    DateTime distributedAt
    String acknowledgement
    String evidenceKey
    String idempotencyKey
  }
  distribution_items {
    String id PK
    String distributionId
    String itemId
    Int quantity
  }
  shelters {
    String id PK
    String code
    String name
    String lgaId
    String ward
    Float lat
    Float lng
    Int capacity
    String facilities
    String accessibility
    String contactPerson
    String contactPhone
  }
  shelter_registrations {
    String id PK
    String shelterId
    String personId
    String name
    String ageBand
    String incidentId
    DateTime checkInAt
    DateTime checkOutAt
    String checkedInById
  }
  shelter_occupancy_history {
    String id PK
    String shelterId
    Int occupancy
    Int capacity
    String reason
    DateTime at
  }
  warehouses ||--o{ inventory_transactions : "warehouse"
  relief_items ||--o{ inventory_transactions : "item"
  warehouses ||--o{ relief_allocations : "warehouse"
  relief_allocations ||--o{ allocation_items : "allocation"
  relief_items ||--o{ allocation_items : "item"
  relief_allocations ||--o{ relief_distributions : "allocation"
  relief_distributions ||--o{ distribution_items : "distribution"
  relief_items ||--o{ distribution_items : "item"
  shelters ||--o{ shelter_registrations : "shelter"
  shelters ||--o{ shelter_occupancy_history : "shelter"
```

## Notifications, alerts & governance

```mermaid
erDiagram
  notifications {
    String id PK
    String userId
    String type
    String title
    String body
    String entityType
    String entityId
    DateTime readAt
    DateTime createdAt
  }
  notification_preferences {
    String userId
    String type
    NotificationChannel channel
    Boolean enabled
  }
  public_alerts {
    String id PK
    String ref
    String title
    String message
    String categoryId
    Severity severity
    String targetLgaIds
    String targetArea
    AlertStatus status
    DateTime publishAt
    DateTime expiresAt
    String issuedById
  }
  alert_approvals {
    String id PK
    String alertId
    String approverId
    String decision
    String comment
    DateTime at
  }
  notification_delivery_logs {
    String id PK
    String notificationId
    String alertId
    NotificationChannel channel
    DeliveryStatus status
    String provider
    String error
    DateTime at
  }
  audit_logs {
    BigInt id PK
    String userId
    String action
    String entityType
    String entityId
    Json before
    Json after
    String reason
    String ip
    String userAgent
    DateTime at
  }
  system_settings {
    String key PK
    Json value
    DateTime updatedAt
  }
  integration_configs {
    String key PK
    Boolean enabled
    String status
    Json config
    DateTime updatedAt
  }
  outbox_events {
    BigInt id PK
    String type
    Json payload
    String scopeLgaId
    DateTime createdAt
    DateTime publishedAt
  }
  idempotency_records {
    String key PK
    String userId
    String route
    Json response
    DateTime createdAt
  }
  public_alerts ||--o{ alert_approvals : "alert"
  notifications |o--o{ notification_delivery_logs : "notification"
  public_alerts |o--o{ notification_delivery_logs : "alert"
```

## Foreign-key inventory (63)

- user_roles → users
- user_roles → roles
- role_permissions → roles
- role_permissions → permissions
- user_scopes → users
- user_scopes → lgas
- sessions → users
- password_reset_tokens → users
- wards → lgas
- communities → lgas
- communities → wards
- incident_reports → ref_categories
- incident_reports → lgas
- report_media → incident_reports
- report_notes → incident_reports
- report_status_history → incident_reports
- incidents → ref_categories
- incidents → lgas
- incident_report_links → incidents
- incident_report_links → incident_reports
- incident_updates → incidents
- incident_media → incidents
- incident_status_history → incidents
- incident_assignments → incidents
- response_teams → ref_categories
- response_teams → lgas
- team_members → response_teams
- team_capabilities → response_teams
- team_equipment → response_teams
- vehicles → response_teams
- deployments → incidents
- deployments → response_teams
- deployment_updates → deployments
- deployment_status_history → deployments
- affected_households → incidents
- affected_households → lgas
- affected_persons → affected_households
- household_needs → affected_households
- damage_assessments → incidents
- damage_assessments → affected_households
- relief_items → ref_categories
- warehouses → lgas
- inventory_transactions → warehouses
- inventory_transactions → relief_items
- relief_allocations → incidents
- relief_allocations → warehouses
- allocation_items → relief_allocations
- allocation_items → relief_items
- beneficiaries → affected_households
- relief_distributions → relief_allocations
- relief_distributions → beneficiaries
- distribution_items → relief_distributions
- distribution_items → relief_items
- shelters → lgas
- shelter_registrations → shelters
- shelter_registrations → affected_persons
- shelter_occupancy_history → shelters
- notifications → users
- notification_preferences → users
- public_alerts → ref_categories
- alert_approvals → public_alerts
- notification_delivery_logs → notifications
- notification_delivery_logs → public_alerts
