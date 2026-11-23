export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  mfaEnabled: boolean;
  mfaRequired: boolean;
  permissions: Set<string>;
  /** null = statewide. [] or list = restricted to these LGA ids. */
  lgaScope: string[] | null;
  ip?: string;
  userAgent?: string;
}