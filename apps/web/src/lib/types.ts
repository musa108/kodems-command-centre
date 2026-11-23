export type Severity = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export interface Me { id: string; email: string; name: string; phone?: string; mfaEnabled: boolean; isDemo: boolean; roles: { key: string; name: string }[]; permissions: string[]; scope: { id: string; name: string }[]; statewide: boolean; environment: string }
export interface Paged<T> { data: T[]; meta: { total: number; page: number; pageSize: number; pages: number } }
export interface Lga { id: string; name: string; code: string }
export interface Category { id: string; key: string; label: string; kind: string }
export interface Overview {
  metrics: { totalIncidents: number; activeIncidents: number; criticalIncidents: number; reportsAwaitingVerification: number; activeDeployments: number; availableTeams: number; affectedPersons: number; displacedPersons: number; activeShelters: number; pendingAllocations: number };
  performance: { avgVerificationMinutes: number | null; avgDispatchMinutes: number | null; avgResponseMinutes: number | null; incidentsResolved: number; openBySeverity: { severity: Severity; count: number }[] };
  byLga: { name: string; count: number }[]; generatedAt: string; environment: string; containsDemoData: boolean;
}
export interface MapIncident { id: string; ref: string; title: string; category: string; categoryLabel: string; severity: Severity; status: string; lat: number; lng: number; lga: string; createdAt: string; teams?: string[] }
export type ReportStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'VERIFIED' | 'DUPLICATE' | 'REJECTED';
export type IncidentStatus = 'OPEN' | 'ASSESSMENT' | 'RESPONSE_ACTIVE' | 'RECOVERY' | 'RESOLVED' | 'CLOSED';
export type DeploymentStatus = 'ASSIGNED' | 'ACCEPTED' | 'EN_ROUTE' | 'ON_SITE' | 'COMPLETED' | 'CANCELLED' | 'REASSIGNED';
