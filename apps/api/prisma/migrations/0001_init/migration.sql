-- Generated from schema.prisma by scripts/gen-sql.js
CREATE TYPE "Severity" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'CRITICAL');

CREATE TYPE "ReportStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'DUPLICATE', 'REJECTED');

CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'ASSESSMENT', 'RESPONSE_ACTIVE', 'RECOVERY', 'RESOLVED', 'CLOSED');

CREATE TYPE "TeamStatus" AS ENUM ('AVAILABLE', 'DEPLOYED', 'UNAVAILABLE', 'MAINTENANCE');

CREATE TYPE "DeploymentStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED', 'CANCELLED', 'REASSIGNED');

CREATE TYPE "DamageLevel" AS ENUM ('NONE', 'MINOR', 'MODERATE', 'SEVERE', 'DESTROYED');

CREATE TYPE "DisplacementStatus" AS ENUM ('NOT_DISPLACED', 'DISPLACED', 'RETURNED', 'RESETTLED');

CREATE TYPE "AllocationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED');

CREATE TYPE "InventoryTxType" AS ENUM ('RECEIPT', 'DONATION', 'PROCUREMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'DISTRIBUTION', 'DAMAGED', 'EXPIRED', 'ADJUSTMENT');

CREATE TYPE "ShelterStatus" AS ENUM ('ACTIVE', 'FULL', 'TEMPORARILY_UNAVAILABLE', 'CLOSED');

CREATE TYPE "AlertStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'EXPIRED', 'CANCELLED');

CREATE TYPE "WarehouseStatus" AS ENUM ('OPERATIONAL', 'LIMITED', 'CLOSED');

CREATE TYPE "CategoryKind" AS ENUM ('INCIDENT', 'TEAM', 'RELIEF', 'SHELTER');

CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'SMS', 'EMAIL');

CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'NOT_CONFIGURED');

CREATE TYPE "UpdateType" AS ENUM ('NOTE', 'UPDATE', 'DECISION', 'SEVERITY_CHANGE', 'OWNER_CHANGE', 'STATUS_CHANGE', 'REPORT_LINKED', 'REOPEN', 'RESOLUTION');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "passwordHash" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  "mfaSecret" TEXT,
  "failedLogins" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "users_email_key" UNIQUE ("email")
);

CREATE TABLE "roles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT true,
  "scopeRequired" BOOLEAN NOT NULL DEFAULT false,
  "mfaRequired" BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY ("id"),
  CONSTRAINT "roles_key_key" UNIQUE ("key")
);

CREATE TABLE "permissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" TEXT NOT NULL,
  "description" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "permissions_key_key" UNIQUE ("key")
);

CREATE TABLE "user_roles" (
  "userId" UUID NOT NULL,
  "roleId" UUID NOT NULL,
  PRIMARY KEY ("userId", "roleId")
);

CREATE TABLE "role_permissions" (
  "roleId" UUID NOT NULL,
  "permissionId" UUID NOT NULL,
  PRIMARY KEY ("roleId", "permissionId")
);

CREATE TABLE "user_scopes" (
  "userId" UUID NOT NULL,
  "lgaId" UUID NOT NULL,
  PRIMARY KEY ("userId", "lgaId")
);

CREATE TABLE "sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "refreshHash" TEXT NOT NULL,
  "userAgent" TEXT,
  "ip" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  CONSTRAINT "sessions_refreshHash_key" UNIQUE ("refreshHash")
);

CREATE INDEX "sessions_userId_idx" ON "sessions" ("userId");

CREATE TABLE "password_reset_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_tokens_tokenHash_key" UNIQUE ("tokenHash")
);

CREATE TABLE "lgas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "source" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "lgas_name_key" UNIQUE ("name"),
  CONSTRAINT "lgas_code_key" UNIQUE ("code")
);

CREATE TABLE "wards" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lgaId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "wards_lgaId_name_key" UNIQUE ("lgaId", "name")
);

CREATE TABLE "communities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lgaId" UUID NOT NULL,
  "wardId" UUID,
  "name" TEXT NOT NULL,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  PRIMARY KEY ("id")
);

CREATE INDEX "communities_lgaId_idx" ON "communities" ("lgaId");

CREATE TABLE "geographic_boundaries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" TEXT NOT NULL,
  "refId" UUID,
  "name" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE INDEX "geographic_boundaries_kind_refId_idx" ON "geographic_boundaries" ("kind", "refId");

CREATE TABLE "ref_categories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" "CategoryKind" NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY ("id"),
  CONSTRAINT "ref_categories_kind_key_key" UNIQUE ("kind", "key")
);

CREATE TABLE "incident_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ref" TEXT NOT NULL,
  "categoryId" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "reporterName" TEXT,
  "reporterPhone" TEXT,
  "incidentAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "lgaId" UUID NOT NULL,
  "ward" TEXT,
  "community" TEXT,
  "address" TEXT,
  "estAffected" INTEGER,
  "immediateNeeds" TEXT,
  "suggestedSeverity" "Severity" NOT NULL DEFAULT 'MODERATE',
  "status" "ReportStatus" NOT NULL DEFAULT 'SUBMITTED',
  "assignedOfficerId" UUID,
  "duplicateOfId" UUID,
  "rejectionReason" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "idempotencyKey" TEXT,
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "incident_reports_ref_key" UNIQUE ("ref"),
  CONSTRAINT "incident_reports_idempotencyKey_key" UNIQUE ("idempotencyKey")
);

CREATE INDEX "incident_reports_status_submittedAt_idx" ON "incident_reports" ("status", "submittedAt");

CREATE INDEX "incident_reports_lgaId_idx" ON "incident_reports" ("lgaId");

CREATE TABLE "report_media" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reportId" UUID NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE TABLE "report_notes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reportId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE TABLE "report_status_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reportId" UUID NOT NULL,
  "from" "ReportStatus",
  "to" "ReportStatus" NOT NULL,
  "actorId" UUID,
  "reason" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE INDEX "report_status_history_reportId_idx" ON "report_status_history" ("reportId");

CREATE TABLE "incidents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ref" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "categoryId" UUID NOT NULL,
  "severity" "Severity" NOT NULL,
  "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "lgaId" UUID NOT NULL,
  "ward" TEXT,
  "community" TEXT,
  "address" TEXT,
  "ownerId" UUID,
  "coordinatorId" UUID,
  "estAffected" INTEGER,
  "verifiedAffected" INTEGER,
  "resolutionSummary" TEXT,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "incidents_ref_key" UNIQUE ("ref")
);

CREATE INDEX "incidents_status_severity_idx" ON "incidents" ("status", "severity");

CREATE INDEX "incidents_lgaId_idx" ON "incidents" ("lgaId");

CREATE TABLE "incident_report_links" (
  "incidentId" UUID NOT NULL,
  "reportId" UUID NOT NULL,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "linkedById" UUID NOT NULL,
  PRIMARY KEY ("incidentId", "reportId")
);

CREATE TABLE "incident_updates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "incidentId" UUID NOT NULL,
  "type" "UpdateType" NOT NULL,
  "body" TEXT NOT NULL,
  "meta" JSONB,
  "authorId" UUID NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE INDEX "incident_updates_incidentId_at_idx" ON "incident_updates" ("incidentId", "at");

CREATE TABLE "incident_media" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "incidentId" UUID NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "uploadedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE TABLE "incident_status_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "incidentId" UUID NOT NULL,
  "from" "IncidentStatus",
  "to" "IncidentStatus" NOT NULL,
  "actorId" UUID,
  "reason" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE INDEX "incident_status_history_incidentId_idx" ON "incident_status_history" ("incidentId");

CREATE TABLE "incident_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "incidentId" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "userId" UUID,
  "assignedById" UUID NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE INDEX "incident_assignments_incidentId_idx" ON "incident_assignments" ("incidentId");

CREATE TABLE "response_teams" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "categoryId" UUID NOT NULL,
  "agency" TEXT NOT NULL,
  "lgaId" UUID NOT NULL,
  "baseLat" DOUBLE PRECISION,
  "baseLng" DOUBLE PRECISION,
  "contact" TEXT,
  "status" "TeamStatus" NOT NULL DEFAULT 'AVAILABLE',
  "lastLat" DOUBLE PRECISION,
  "lastLng" DOUBLE PRECISION,
  "lastLocationAt" TIMESTAMP(3),
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "response_teams_code_key" UNIQUE ("code")
);

CREATE INDEX "response_teams_status_idx" ON "response_teams" ("status");

CREATE TABLE "team_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "teamId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "role" TEXT,
  "isLeader" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY ("id")
);

CREATE INDEX "team_members_teamId_idx" ON "team_members" ("teamId");

CREATE TABLE "team_capabilities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "teamId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "team_capabilities_teamId_name_key" UNIQUE ("teamId", "name")
);

CREATE TABLE "team_equipment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "teamId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "condition" TEXT,
  PRIMARY KEY ("id")
);

CREATE TABLE "vehicles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "teamId" UUID NOT NULL,
  "plate" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPERATIONAL',
  PRIMARY KEY ("id"),
  CONSTRAINT "vehicles_plate_key" UNIQUE ("plate")
);

CREATE TABLE "deployments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ref" TEXT NOT NULL,
  "incidentId" UUID NOT NULL,
  "teamId" UUID NOT NULL,
  "assignedById" UUID NOT NULL,
  "destination" TEXT NOT NULL,
  "priority" "Severity" NOT NULL DEFAULT 'MODERATE',
  "instructions" TEXT,
  "requiredResources" TEXT,
  "status" "DeploymentStatus" NOT NULL DEFAULT 'ASSIGNED',
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "departedAt" TIMESTAMP(3),
  "arrivedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "reassignedToId" UUID,
  "completionReport" TEXT,
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "deployments_ref_key" UNIQUE ("ref")
);

CREATE INDEX "deployments_incidentId_idx" ON "deployments" ("incidentId");

CREATE INDEX "deployments_teamId_status_idx" ON "deployments" ("teamId", "status");

CREATE TABLE "deployment_updates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "deploymentId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "authorId" UUID NOT NULL,
  "idempotencyKey" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  CONSTRAINT "deployment_updates_idempotencyKey_key" UNIQUE ("idempotencyKey")
);

CREATE INDEX "deployment_updates_deploymentId_at_idx" ON "deployment_updates" ("deploymentId", "at");

CREATE TABLE "deployment_status_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "deploymentId" UUID NOT NULL,
  "from" "DeploymentStatus",
  "to" "DeploymentStatus" NOT NULL,
  "actorId" UUID,
  "reason" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE INDEX "deployment_status_history_deploymentId_idx" ON "deployment_status_history" ("deploymentId");

CREATE TABLE "affected_households" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ref" TEXT NOT NULL,
  "headName" TEXT NOT NULL,
  "incidentId" UUID NOT NULL,
  "lgaId" UUID NOT NULL,
  "ward" TEXT,
  "community" TEXT,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "size" INTEGER NOT NULL,
  "damage" "DamageLevel" NOT NULL DEFAULT 'NONE',
  "displacement" "DisplacementStatus" NOT NULL DEFAULT 'NOT_DISPLACED',
  "immediateNeeds" TEXT,
  "source" TEXT NOT NULL DEFAULT 'FIELD_REGISTRATION',
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "affected_households_ref_key" UNIQUE ("ref")
);

CREATE INDEX "affected_households_incidentId_idx" ON "affected_households" ("incidentId");

CREATE INDEX "affected_households_lgaId_idx" ON "affected_households" ("lgaId");

CREATE TABLE "affected_persons" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ref" TEXT NOT NULL,
  "householdId" UUID NOT NULL,
  "name" TEXT,
  "ageBand" TEXT,
  "sex" TEXT,
  "relationship" TEXT,
  "displacement" "DisplacementStatus" NOT NULL DEFAULT 'NOT_DISPLACED',
  "assistanceNeeds" TEXT,
  "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  CONSTRAINT "affected_persons_ref_key" UNIQUE ("ref")
);

CREATE INDEX "affected_persons_householdId_idx" ON "affected_persons" ("householdId");

CREATE TABLE "household_needs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "householdId" UUID NOT NULL,
  "need" TEXT NOT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE "damage_assessments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "incidentId" UUID NOT NULL,
  "householdId" UUID,
  "level" "DamageLevel" NOT NULL,
  "description" TEXT,
  "assessedById" UUID NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE TABLE "relief_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "categoryId" UUID NOT NULL,
  "unit" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY ("id"),
  CONSTRAINT "relief_items_sku_key" UNIQUE ("sku")
);

CREATE TABLE "warehouses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "lgaId" UUID NOT NULL,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "contactPerson" TEXT,
  "contactPhone" TEXT,
  "capacity" TEXT,
  "status" "WarehouseStatus" NOT NULL DEFAULT 'OPERATIONAL',
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY ("id"),
  CONSTRAINT "warehouses_code_key" UNIQUE ("code")
);

CREATE TABLE "inventory_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "warehouseId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "type" "InventoryTxType" NOT NULL,
  "delta" INTEGER NOT NULL,
  "reference" TEXT,
  "reason" TEXT,
  "allocationId" UUID,
  "distributionId" UUID,
  "transferGroup" UUID,
  "idempotencyKey" TEXT,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  CONSTRAINT "inventory_transactions_idempotencyKey_key" UNIQUE ("idempotencyKey")
);

CREATE INDEX "inventory_transactions_warehouseId_itemId_idx" ON "inventory_transactions" ("warehouseId", "itemId");

CREATE TABLE "relief_allocations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ref" TEXT NOT NULL,
  "incidentId" UUID NOT NULL,
  "warehouseId" UUID NOT NULL,
  "targetArea" TEXT NOT NULL,
  "status" "AllocationStatus" NOT NULL DEFAULT 'DRAFT',
  "requestedById" UUID NOT NULL,
  "approvedById" UUID,
  "decisionNote" TEXT,
  "approvedAt" TIMESTAMP(3),
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  CONSTRAINT "relief_allocations_ref_key" UNIQUE ("ref")
);

CREATE INDEX "relief_allocations_status_idx" ON "relief_allocations" ("status");

CREATE TABLE "allocation_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "allocationId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "allocation_items_allocationId_itemId_key" UNIQUE ("allocationId", "itemId")
);

CREATE TABLE "beneficiaries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ref" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "householdId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  CONSTRAINT "beneficiaries_ref_key" UNIQUE ("ref"),
  CONSTRAINT "beneficiaries_householdId_key" UNIQUE ("householdId")
);

CREATE TABLE "relief_distributions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ref" TEXT NOT NULL,
  "allocationId" UUID NOT NULL,
  "beneficiaryId" UUID NOT NULL,
  "distributedById" UUID NOT NULL,
  "distributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgement" TEXT,
  "evidenceKey" TEXT,
  "idempotencyKey" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "relief_distributions_ref_key" UNIQUE ("ref"),
  CONSTRAINT "relief_distributions_idempotencyKey_key" UNIQUE ("idempotencyKey")
);

CREATE INDEX "relief_distributions_allocationId_idx" ON "relief_distributions" ("allocationId");

CREATE TABLE "distribution_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "distributionId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE "shelters" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "lgaId" UUID NOT NULL,
  "ward" TEXT,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "capacity" INTEGER NOT NULL,
  "facilities" TEXT[] NOT NULL,
  "accessibility" TEXT,
  "contactPerson" TEXT,
  "contactPhone" TEXT,
  "shortages" TEXT,
  "status" "ShelterStatus" NOT NULL DEFAULT 'ACTIVE',
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "shelters_code_key" UNIQUE ("code")
);

CREATE TABLE "shelter_registrations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shelterId" UUID NOT NULL,
  "personId" UUID,
  "name" TEXT NOT NULL,
  "ageBand" TEXT,
  "incidentId" UUID,
  "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checkOutAt" TIMESTAMP(3),
  "checkedInById" UUID NOT NULL,
  PRIMARY KEY ("id")
);

CREATE INDEX "shelter_registrations_shelterId_checkOutAt_idx" ON "shelter_registrations" ("shelterId", "checkOutAt");

CREATE TABLE "shelter_occupancy_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shelterId" UUID NOT NULL,
  "occupancy" INTEGER NOT NULL,
  "capacity" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE INDEX "shelter_occupancy_history_shelterId_at_idx" ON "shelter_occupancy_history" ("shelterId", "at");

CREATE TABLE "notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE INDEX "notifications_userId_readAt_idx" ON "notifications" ("userId", "readAt");

CREATE TABLE "notification_preferences" (
  "userId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY ("userId", "type", "channel")
);

CREATE TABLE "public_alerts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ref" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "categoryId" UUID NOT NULL,
  "severity" "Severity" NOT NULL,
  "targetLgaIds" UUID[] NOT NULL,
  "targetArea" TEXT,
  "status" "AlertStatus" NOT NULL DEFAULT 'DRAFT',
  "publishAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "issuedById" UUID NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  CONSTRAINT "public_alerts_ref_key" UNIQUE ("ref")
);

CREATE TABLE "alert_approvals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "alertId" UUID NOT NULL,
  "approverId" UUID NOT NULL,
  "decision" TEXT NOT NULL,
  "comment" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE INDEX "alert_approvals_alertId_idx" ON "alert_approvals" ("alertId");

CREATE TABLE "notification_delivery_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "notificationId" UUID,
  "alertId" UUID,
  "channel" "NotificationChannel" NOT NULL,
  "status" "DeliveryStatus" NOT NULL,
  "provider" TEXT,
  "error" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" BIGSERIAL NOT NULL,
  "userId" UUID,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "before" JSONB,
  "after" JSONB,
  "reason" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs" ("entityType", "entityId");

CREATE INDEX "audit_logs_userId_at_idx" ON "audit_logs" ("userId", "at");

CREATE INDEX "audit_logs_at_idx" ON "audit_logs" ("at");

CREATE TABLE "system_settings" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("key")
);

CREATE TABLE "integration_configs" (
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  "config" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("key")
);

CREATE TABLE "outbox_events" (
  "id" BIGSERIAL NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "scopeLgaId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  PRIMARY KEY ("id")
);

CREATE INDEX "outbox_events_publishedAt_id_idx" ON "outbox_events" ("publishedAt", "id");

CREATE TABLE "idempotency_records" (
  "key" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "route" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("key")
);

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_scopes" ADD CONSTRAINT "user_scopes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_scopes" ADD CONSTRAINT "user_scopes_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "lgas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wards" ADD CONSTRAINT "wards_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "lgas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "communities" ADD CONSTRAINT "communities_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "lgas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "communities" ADD CONSTRAINT "communities_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "wards" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ref_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "lgas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "report_media" ADD CONSTRAINT "report_media_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "incident_reports" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "report_notes" ADD CONSTRAINT "report_notes_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "incident_reports" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "report_status_history" ADD CONSTRAINT "report_status_history_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "incident_reports" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ref_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "lgas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incident_report_links" ADD CONSTRAINT "incident_report_links_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incident_report_links" ADD CONSTRAINT "incident_report_links_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "incident_reports" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incident_media" ADD CONSTRAINT "incident_media_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incident_status_history" ADD CONSTRAINT "incident_status_history_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incident_assignments" ADD CONSTRAINT "incident_assignments_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "response_teams" ADD CONSTRAINT "response_teams_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ref_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "response_teams" ADD CONSTRAINT "response_teams_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "lgas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "response_teams" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "team_capabilities" ADD CONSTRAINT "team_capabilities_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "response_teams" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "team_equipment" ADD CONSTRAINT "team_equipment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "response_teams" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "response_teams" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deployments" ADD CONSTRAINT "deployments_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deployments" ADD CONSTRAINT "deployments_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "response_teams" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deployment_updates" ADD CONSTRAINT "deployment_updates_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "deployments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deployment_status_history" ADD CONSTRAINT "deployment_status_history_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "deployments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "affected_households" ADD CONSTRAINT "affected_households_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "affected_households" ADD CONSTRAINT "affected_households_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "lgas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "affected_persons" ADD CONSTRAINT "affected_persons_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "affected_households" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "household_needs" ADD CONSTRAINT "household_needs_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "affected_households" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "damage_assessments" ADD CONSTRAINT "damage_assessments_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "damage_assessments" ADD CONSTRAINT "damage_assessments_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "affected_households" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "relief_items" ADD CONSTRAINT "relief_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ref_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "lgas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "relief_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "relief_allocations" ADD CONSTRAINT "relief_allocations_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "relief_allocations" ADD CONSTRAINT "relief_allocations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "allocation_items" ADD CONSTRAINT "allocation_items_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "relief_allocations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "allocation_items" ADD CONSTRAINT "allocation_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "relief_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "affected_households" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "relief_distributions" ADD CONSTRAINT "relief_distributions_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "relief_allocations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "relief_distributions" ADD CONSTRAINT "relief_distributions_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "beneficiaries" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distribution_items" ADD CONSTRAINT "distribution_items_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "relief_distributions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distribution_items" ADD CONSTRAINT "distribution_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "relief_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shelters" ADD CONSTRAINT "shelters_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "lgas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shelter_registrations" ADD CONSTRAINT "shelter_registrations_shelterId_fkey" FOREIGN KEY ("shelterId") REFERENCES "shelters" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shelter_registrations" ADD CONSTRAINT "shelter_registrations_personId_fkey" FOREIGN KEY ("personId") REFERENCES "affected_persons" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shelter_occupancy_history" ADD CONSTRAINT "shelter_occupancy_history_shelterId_fkey" FOREIGN KEY ("shelterId") REFERENCES "shelters" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public_alerts" ADD CONSTRAINT "public_alerts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ref_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "alert_approvals" ADD CONSTRAINT "alert_approvals_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "public_alerts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_delivery_logs" ADD CONSTRAINT "notification_delivery_logs_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_delivery_logs" ADD CONSTRAINT "notification_delivery_logs_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "public_alerts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
