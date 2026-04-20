import { Context } from 'hono';
import { googleAdsQuery, googleAdsMutate, resolveConnectionAndToken } from '../../lib/google-ads-api.js';

type Action =
  | 'list_asset_groups'
  | 'get_asset_group_detail'
  | 'create_asset_group'
  | 'add_asset'
  | 'remove_asset'
  | 'update_asset_group'
  | 'remove_asset_group';

interface RequestBody {
  action: Action;
  connection_id: string;
  asset_group_id?: string;
  campaign_id?: string;
  data?: Record<string, any>;
}

// --- Action handlers ---

async function handleListAssetGroups(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  campaignId?: string
): Promise<{ body: any; status: number }> {
  // Filtro `campaign.status != 'REMOVED'` crítico: Google no permite mutar
  // asset groups de campañas eliminadas ("Asset group cannot be mutated for
  // removed campaign"). Mostrar AGs huérfanos hace que cualquier acción
  // (pause/rename/delete) falle con ese error.
  let query = `
    SELECT asset_group.id, asset_group.name, asset_group.status,
           asset_group.campaign, campaign.name, campaign.id,
           asset_group.ad_strength
    FROM asset_group
    WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
      AND asset_group.status != 'REMOVED'
      AND campaign.status != 'REMOVED'
  `;

  if (campaignId) {
    query += ` AND campaign.id = ${campaignId}`;
  }

  query += ` ORDER BY campaign.name, asset_group.name`;

  const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, query);

  if (!result.ok) {
    return { body: { error: 'Failed to fetch asset groups', details: result.error }, status: 502 };
  }

  const assetGroups = (result.data || []).map((row: any) => ({
    id: row.assetGroup?.id,
    name: row.assetGroup?.name,
    status: row.assetGroup?.status,
    ad_strength: row.assetGroup?.adStrength,
    campaign_id: row.campaign?.id,
    campaign_name: row.campaign?.name,
  }));

  return { body: { success: true, asset_groups: assetGroups }, status: 200 };
}

async function handleGetAssetGroupDetail(
  customerId: string,
  assetGroupId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<{ body: any; status: number }> {
  // Get asset group info
  const groupQuery = `
    SELECT asset_group.id, asset_group.name, asset_group.status,
           asset_group.ad_strength, asset_group.final_urls,
           campaign.id, campaign.name
    FROM asset_group
    WHERE asset_group.id = ${assetGroupId}
  `;
  const groupResult = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, groupQuery);

  if (!groupResult.ok || !groupResult.data?.length) {
    return { body: { error: 'Asset group not found', details: groupResult.error }, status: 404 };
  }

  const group = groupResult.data[0];

  // Get assets linked to this asset group
  const assetsQuery = `
    SELECT asset_group_asset.asset, asset_group_asset.field_type,
           asset_group_asset.status,
           asset.name, asset.type,
           asset.text_asset.text,
           asset.image_asset.full_size.url,
           asset.youtube_video_asset.youtube_video_id
    FROM asset_group_asset
    WHERE asset_group.id = ${assetGroupId}
  `;
  const assetsResult = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, assetsQuery);

  const assets = (assetsResult.ok ? assetsResult.data || [] : []).map((row: any) => ({
    resource_name: row.assetGroupAsset?.asset,
    field_type: row.assetGroupAsset?.fieldType,
    status: row.assetGroupAsset?.status,
    name: row.asset?.name,
    type: row.asset?.type,
    text: row.asset?.textAsset?.text,
    image_url: row.asset?.imageAsset?.fullSize?.url,
    youtube_video_id: row.asset?.youtubeVideoAsset?.youtubeVideoId,
  }));

  // Group assets by type
  const grouped: Record<string, any[]> = {};
  for (const a of assets) {
    const ft = a.field_type || 'UNKNOWN';
    if (!grouped[ft]) grouped[ft] = [];
    grouped[ft].push(a);
  }

  return {
    body: {
      success: true,
      asset_group: {
        id: group.assetGroup?.id,
        name: group.assetGroup?.name,
        status: group.assetGroup?.status,
        ad_strength: group.assetGroup?.adStrength,
        final_urls: group.assetGroup?.finalUrls,
        campaign_id: group.campaign?.id,
        campaign_name: group.campaign?.name,
      },
      assets: grouped,
      asset_count: assets.length,
    },
    status: 200,
  };
}

async function handleCreateAssetGroup(
  customerId: string,
  campaignId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { name, final_urls, headlines, descriptions, long_headlines, business_name } = data;

  if (!name) return { body: { error: 'Missing required field: name' }, status: 400 };
  if (!final_urls?.length) return { body: { error: 'At least one final URL is required' }, status: 400 };

  const mutateOps: any[] = [];
  let tempId = -1;

  // Asset Group (temp ID -1)
  mutateOps.push({
    assetGroupOperation: {
      create: {
        resourceName: `customers/${customerId}/assetGroups/${tempId}`,
        campaign: `customers/${customerId}/campaigns/${campaignId}`,
        name,
        finalUrls: final_urls,
        status: 'ENABLED',
      },
    },
  });

  const assetGroupRef = `customers/${customerId}/assetGroups/${tempId}`;
  tempId--;

  // Helper to add text asset + link
  const addTextAsset = (text: string, fieldType: string) => {
    const assetTempId = tempId--;
    mutateOps.push({
      assetOperation: {
        create: {
          resourceName: `customers/${customerId}/assets/${assetTempId}`,
          type: 'TEXT',
          textAsset: { text },
        },
      },
    });
    mutateOps.push({
      assetGroupAssetOperation: {
        create: {
          asset: `customers/${customerId}/assets/${assetTempId}`,
          assetGroup: assetGroupRef,
          fieldType,
        },
      },
    });
  };

  // Headlines (max 15, min 3 required)
  if (headlines?.length) {
    for (const hl of headlines.slice(0, 15)) {
      addTextAsset(hl, 'HEADLINE');
    }
  }

  // Long headlines (max 5)
  if (long_headlines?.length) {
    for (const lh of long_headlines.slice(0, 5)) {
      addTextAsset(lh, 'LONG_HEADLINE');
    }
  }

  // Descriptions (max 4, min 2 required)
  if (descriptions?.length) {
    for (const desc of descriptions.slice(0, 4)) {
      addTextAsset(desc, 'DESCRIPTION');
    }
  }

  // Business name
  if (business_name) {
    addTextAsset(business_name, 'BUSINESS_NAME');
  }

  console.log(`[manage-google-pmax] Creating asset group "${name}" with ${mutateOps.length} operations`);

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, mutateOps);

  if (!result.ok) {
    return { body: { error: 'Failed to create asset group', details: result.error }, status: 502 };
  }

  return { body: { success: true, campaign_id: campaignId, data: result.data }, status: 200 };
}

async function handleAddAsset(
  customerId: string,
  assetGroupId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { field_type, text, image_data, image_name, youtube_video_id, cta_enum } = data;

  if (!field_type) return { body: { error: 'Missing field_type' }, status: 400 };

  const mutateOps: any[] = [];
  const assetTempId = -1;

  // Create asset based on type
  if (field_type === 'MARKETING_IMAGE' || field_type === 'SQUARE_MARKETING_IMAGE' ||
      field_type === 'PORTRAIT_MARKETING_IMAGE' || field_type === 'LOGO' || field_type === 'LANDSCAPE_LOGO') {
    if (!image_data) return { body: { error: 'Missing image_data (base64)' }, status: 400 };

    mutateOps.push({
      assetOperation: {
        create: {
          resourceName: `customers/${customerId}/assets/${assetTempId}`,
          type: 'IMAGE',
          imageAsset: { data: image_data },
          name: `${image_name || 'Image'}-${Math.abs(assetTempId)}`,
        },
      },
    });
  } else if (field_type === 'YOUTUBE_VIDEO') {
    if (!youtube_video_id) return { body: { error: 'Missing youtube_video_id' }, status: 400 };

    mutateOps.push({
      assetOperation: {
        create: {
          resourceName: `customers/${customerId}/assets/${assetTempId}`,
          type: 'YOUTUBE_VIDEO',
          youtubeVideoAsset: { youtubeVideoId: youtube_video_id },
        },
      },
    });
  } else if (field_type === 'CALL_TO_ACTION_SELECTION') {
    if (!cta_enum) return { body: { error: 'Missing cta_enum (ej: SHOP_NOW, LEARN_MORE, ...)' }, status: 400 };
    // v23: callToActionAsset con enum (no textAsset) — ver memory sesión 20/04
    mutateOps.push({
      assetOperation: {
        create: {
          resourceName: `customers/${customerId}/assets/${assetTempId}`,
          type: 'CALL_TO_ACTION',
          callToActionAsset: { callToAction: cta_enum },
        },
      },
    });
  } else {
    // Text-based assets (HEADLINE, DESCRIPTION, LONG_HEADLINE, BUSINESS_NAME)
    if (!text) return { body: { error: 'Missing text' }, status: 400 };

    mutateOps.push({
      assetOperation: {
        create: {
          resourceName: `customers/${customerId}/assets/${assetTempId}`,
          type: 'TEXT',
          textAsset: { text },
        },
      },
    });
  }

  // Link asset to asset group
  mutateOps.push({
    assetGroupAssetOperation: {
      create: {
        asset: `customers/${customerId}/assets/${assetTempId}`,
        assetGroup: `customers/${customerId}/assetGroups/${assetGroupId}`,
        fieldType: field_type,
      },
    },
  });

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, mutateOps);

  if (!result.ok) {
    return { body: { error: 'Failed to add asset', details: result.error }, status: 502 };
  }

  return { body: { success: true, asset_group_id: assetGroupId, field_type }, status: 200 };
}

async function handleRemoveAsset(
  customerId: string,
  assetGroupId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { asset_resource_name, field_type } = data;

  if (!asset_resource_name) return { body: { error: 'Missing asset_resource_name' }, status: 400 };
  if (!field_type) return { body: { error: 'Missing field_type' }, status: 400 };

  // Remove the asset group asset link
  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    assetGroupAssetOperation: {
      remove: `customers/${customerId}/assetGroups/${assetGroupId}/assetGroupAssets/${field_type}~${asset_resource_name.split('/').pop()}`,
    },
  }]);

  if (!result.ok) {
    return { body: { error: 'Failed to remove asset', details: result.error }, status: 502 };
  }

  return { body: { success: true, asset_group_id: assetGroupId }, status: 200 };
}

async function handleUpdateAssetGroup(
  customerId: string,
  assetGroupId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  // v23 rechaza update status='REMOVED' — redirigir a remove operation.
  if (data.status === 'REMOVED') {
    console.warn('[manage-google-pmax] deprecated: use action=remove_asset_group instead of update_asset_group{status:REMOVED}');
    return handleRemoveAssetGroup(customerId, assetGroupId, accessToken, developerToken, loginCustomerId);
  }

  const updateFields: Record<string, any> = {};
  const updateMaskParts: string[] = [];

  if (data.name) {
    updateFields.name = data.name;
    updateMaskParts.push('name');
  }
  if (data.final_urls) {
    updateFields.finalUrls = data.final_urls;
    updateMaskParts.push('final_urls');
  }
  if (data.status) {
    updateFields.status = data.status;
    updateMaskParts.push('status');
  }

  if (updateMaskParts.length === 0) {
    return { body: { error: 'No fields to update' }, status: 400 };
  }

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    assetGroupOperation: {
      update: {
        resourceName: `customers/${customerId}/assetGroups/${assetGroupId}`,
        ...updateFields,
      },
      updateMask: updateMaskParts.join(','),
    },
  }]);

  if (!result.ok) {
    return { body: { error: 'Failed to update asset group', details: result.error }, status: 502 };
  }

  return { body: { success: true, asset_group_id: assetGroupId }, status: 200 };
}

// Soft-delete de asset groups via AssetGroupOperation.remove (no update).
// Igual que Campaign en v23, el patrón oficial es pasar el resource_name como
// valor del campo `remove`. Un update con status='REMOVED' falla con
// "Enum value 'REMOVED' cannot be used" (mismo comportamiento que Campaign v23).
// Google marca el asset group como REMOVED internamente y queda oculto del
// GAQL por el filtro `asset_group.status != 'REMOVED'`.
async function handleRemoveAssetGroup(
  customerId: string,
  assetGroupId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<{ body: any; status: number }> {
  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    assetGroupOperation: {
      remove: `customers/${customerId}/assetGroups/${assetGroupId}`,
    },
  }]);

  if (!result.ok) {
    return { body: { error: 'Failed to remove asset group', details: result.error }, status: 502 };
  }

  return { body: { success: true, asset_group_id: assetGroupId, status: 'REMOVED' }, status: 200 };
}

// --- Main handler ---

export async function manageGooglePmax(c: Context) {
  try {
    const body: RequestBody = await c.req.json();
    const { action, connection_id, asset_group_id, campaign_id, data } = body;

    if (!action) return c.json({ error: 'Missing required field: action' }, 400);
    if (!connection_id) return c.json({ error: 'Missing required field: connection_id' }, 400);

    const validActions: Action[] = [
      'list_asset_groups', 'get_asset_group_detail',
      'create_asset_group', 'add_asset', 'remove_asset', 'update_asset_group', 'remove_asset_group',
    ];

    if (!validActions.includes(action)) {
      return c.json({ error: `Invalid action: ${action}. Valid: ${validActions.join(', ')}` }, 400);
    }

    // Actions that require asset_group_id
    const needsAssetGroupId: Action[] = ['get_asset_group_detail', 'add_asset', 'remove_asset', 'update_asset_group', 'remove_asset_group'];
    if (needsAssetGroupId.includes(action) && !asset_group_id) {
      return c.json({ error: `Missing asset_group_id for action "${action}"` }, 400);
    }

    // create_asset_group requires campaign_id
    if (action === 'create_asset_group' && !campaign_id) {
      return c.json({ error: 'Missing campaign_id for create_asset_group' }, 400);
    }

    console.log(`[manage-google-pmax] Action: ${action}, Connection: ${connection_id}`);

    const resolved = await resolveConnectionAndToken(c, connection_id);
    if ('error' in resolved) {
      return c.json({ error: resolved.error }, resolved.status as any);
    }
    const { ctx } = resolved;

    let result: { body: any; status: number };

    switch (action) {
      case 'list_asset_groups':
        result = await handleListAssetGroups(ctx.customerId, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId, campaign_id);
        break;
      case 'get_asset_group_detail':
        result = await handleGetAssetGroupDetail(ctx.customerId, asset_group_id!, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId);
        break;
      case 'create_asset_group':
        result = await handleCreateAssetGroup(ctx.customerId, campaign_id!, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId, data || {});
        break;
      case 'add_asset':
        result = await handleAddAsset(ctx.customerId, asset_group_id!, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId, data || {});
        break;
      case 'remove_asset':
        result = await handleRemoveAsset(ctx.customerId, asset_group_id!, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId, data || {});
        break;
      case 'update_asset_group':
        result = await handleUpdateAssetGroup(ctx.customerId, asset_group_id!, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId, data || {});
        break;
      case 'remove_asset_group':
        result = await handleRemoveAssetGroup(ctx.customerId, asset_group_id!, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId);
        break;
      default:
        result = { body: { error: `Unhandled action: ${action}` }, status: 400 };
    }

    return c.json(result.body, result.status as any);
  } catch (error: any) {
    console.error('[manage-google-pmax] Error:', error);
    return c.json({ error: 'Internal server error', details: error.message }, 500);
  }
}
