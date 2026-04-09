/**
 * Shared types for Leadsie webhook payloads.
 * Used by both Meta and Google Ads webhook handlers.
 */

export interface LeadsieAsset {
  id: string;
  name: string;
  type: string;
  platform: string;
  connectionStatus: 'Connected' | 'In progress' | 'Unknown' | 'Insufficient permissions' | 'Not Connected';
  wasInitialGrantSuccessful?: boolean;
  time?: string;
  statusLastCheckedAt?: string;
  linkToAsset?: string;
  accessLevel?: 'Manage' | 'ViewOnly' | 'Owner';
  wasInvitedByEmail?: boolean;
  wasCreatedByLeadsie?: boolean;
  wasGrantedViaAssetType?: string;
  platformPermissionsGranted?: string | string[];
  shopifyCollaboratorCode?: string;
  messageFromUser?: string;
  notes?: string;
  assignedUsers?: Array<{
    id?: string;
    name?: string;
    role?: string;
    isSuccess?: boolean;
  }>;
  connectedAccount?: { id: string; name: string };
  googleBusinessProfileLocationMapsUri?: string;
  googleBusinessProfileLocationPlaceId?: string;
}

export interface LeadsiePayload {
  user?: string;               // customUserId — we pass client_id here
  accessLevel?: 'view' | 'admin';
  requestName?: string;
  requestUrl?: string;
  status?: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
  clientName?: string;
  clientSummaryUrl?: string;
  apiVersion?: number;
  connectionAssets?: LeadsieAsset[];
}
