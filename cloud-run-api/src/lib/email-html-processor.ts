import { getSupabaseAdmin } from './supabase.js';
import { evaluateBlockConditions, type BlockCondition, type TemplateContext } from './template-engine.js';
import {
  getProductCatalog,
  generateRecommendationBlock,
  replaceProductRecommendations,
} from '../routes/email/product-recommendations.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessorOptions {
  clientId: string;
  subscriberId: string;
  /** Enrollment metadata (for abandoned cart line_items, etc.) */
  enrollmentMetadata?: Record<string, any>;
  /** Template context built from subscriber + brand data */
  templateContext?: TemplateContext | Record<string, any>;
  /** Campaign-level recommendation config (legacy merge-tag support) */
  recommendationConfig?: { type: string; count: number } | null;
}

// ---------------------------------------------------------------------------
// HTML escape utility (prevents XSS in product titles/URLs)
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Depth-aware block extraction (solves nested div problem)
// ---------------------------------------------------------------------------

interface ExtractedBlock {
  fullMatch: string;
  attrs: string;
  inner: string;
  startIndex: number;
}

/**
 * Extract blocks by a data attribute, respecting nested tags of the same type.
 * Solves the critical bug where regex `<div>...</div>` matches the wrong
 * closing tag when divs are nested inside.
 */
function extractBlocksByAttr(html: string, attrName: string, attrValue?: string): ExtractedBlock[] {
  const results: ExtractedBlock[] = [];
  const searchPattern = attrValue
    ? `${attrName}="${attrValue}"`
    : attrName;

  let searchFrom = 0;
  while (searchFrom < html.length) {
    // Find opening <div with the target attribute
    const attrPos = html.indexOf(searchPattern, searchFrom);
    if (attrPos === -1) break;

    // Walk backwards to find the opening <div
    let tagStart = html.lastIndexOf('<div', attrPos);
    if (tagStart === -1 || tagStart < searchFrom) {
      // Also try other common tags
      for (const tag of ['<td', '<tr', '<table', '<span', '<section']) {
        const pos = html.lastIndexOf(tag, attrPos);
        if (pos !== -1 && pos >= searchFrom && pos > tagStart) {
          tagStart = pos;
        }
      }
      if (tagStart === -1 || tagStart < searchFrom) {
        searchFrom = attrPos + searchPattern.length;
        continue;
      }
    }

    // Determine the tag name
    const tagNameMatch = html.substring(tagStart).match(/^<([a-z][a-z0-9]*)/i);
    if (!tagNameMatch) {
      searchFrom = attrPos + searchPattern.length;
      continue;
    }
    const tagName = tagNameMatch[1].toLowerCase();

    // Find the end of the opening tag
    const openTagEnd = html.indexOf('>', tagStart);
    if (openTagEnd === -1) break;

    const attrs = html.substring(tagStart + tagName.length + 1, openTagEnd);

    // Now walk forward counting depth to find the matching closing tag
    let depth = 1;
    let pos = openTagEnd + 1;
    const openPattern = new RegExp(`<${tagName}\\b`, 'gi');
    const closePattern = `</${tagName}>`;

    while (depth > 0 && pos < html.length) {
      const nextCloseIdx = html.indexOf(closePattern, pos);
      if (nextCloseIdx === -1) break; // Malformed HTML

      // Count any opening tags between pos and nextCloseIdx
      openPattern.lastIndex = pos;
      let nextOpen = openPattern.exec(html);
      while (nextOpen && nextOpen.index < nextCloseIdx) {
        depth++;
        nextOpen = openPattern.exec(html);
      }

      depth--; // For the closing tag we found
      if (depth === 0) {
        const endIdx = nextCloseIdx + closePattern.length;
        const fullMatch = html.substring(tagStart, endIdx);
        const inner = html.substring(openTagEnd + 1, nextCloseIdx);
        results.push({ fullMatch, attrs, inner, startIndex: tagStart });
        searchFrom = endIdx;
      } else {
        pos = nextCloseIdx + closePattern.length;
      }
    }

    if (depth > 0) {
      // Could not find matching close tag, skip
      searchFrom = openTagEnd + 1;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main processor — runs PER SUBSCRIBER, after Nunjucks, before sendSingleEmail
// ---------------------------------------------------------------------------

/**
 * Process all Steve Mail custom blocks in the HTML:
 *   1. Conditional blocks (remove blocks that don't apply)
 *   2. Product blocks (replace placeholders with real Shopify products)
 *   3. Discount blocks (generate unique codes in Shopify if needed)
 *   4. Legacy {{ product_recommendations }} merge tag
 *
 * Order matters: conditionals first avoids processing products/discounts
 * inside blocks that will be removed.
 *
 * Each step is wrapped in try/catch so a single failure does NOT crash
 * the entire email send. The email degrades gracefully.
 */
export async function processEmailHtml(
  html: string,
  options: ProcessorOptions
): Promise<string> {
  let result = html;

  // 1. Conditional blocks
  if (result.includes('data-steve-condition')) {
    try {
      result = processConditionalBlocks(result, options.templateContext || {});
    } catch (err) {
      console.error('[email-html-processor] Conditional blocks failed:', err);
    }
  }

  // 2. Product blocks
  if (result.includes('data-steve-products')) {
    try {
      result = await replaceProductBlocks(result, options);
    } catch (err) {
      console.error('[email-html-processor] Product blocks failed:', err);
    }
  }

  // 3. Discount blocks
  if (result.includes('data-steve-discount')) {
    try {
      result = await replaceDiscountBlocks(result, options);
    } catch (err) {
      console.error('[email-html-processor] Discount blocks failed:', err);
    }
  }

  // 4. Legacy {{ product_recommendations }} merge tag (per-subscriber)
  if (result.includes('product_recommendations')) {
    try {
      result = await replaceProductRecommendations(
        result,
        options.clientId,
        options.subscriberId,
        options.recommendationConfig || null
      );
    } catch (err) {
      console.error('[email-html-processor] Product recommendations failed:', err);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Feature 4: Conditional Blocks
// ---------------------------------------------------------------------------

/**
 * Find all elements with data-steve-condition, parse their JSON conditions,
 * evaluate against the template context, and remove blocks that don't pass.
 * Uses depth-aware extraction to handle nested HTML correctly.
 */
function processConditionalBlocks(
  html: string,
  context: TemplateContext | Record<string, any>
): string {
  const blocks = extractBlocksByAttr(html, 'data-steve-condition');
  if (blocks.length === 0) return html;

  let result = html;

  // Process in reverse order so string indices remain valid
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    try {
      // Extract the JSON from the attribute (supports both single and double quotes)
      const condMatch = block.attrs.match(/data-steve-condition=(?:'([^']*)'|"([^"]*)")/);
      if (!condMatch) continue;

      const conditionJson = condMatch[1] ?? condMatch[2] ?? '';
      // Decode HTML entities that may have been applied by the editor
      const decoded = conditionJson.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      const conditions: BlockCondition[] = JSON.parse(decoded);
      const mappedConditions = conditions.map(mapConditionOperator);
      const passes = evaluateBlockConditions(mappedConditions, context);

      if (!passes) {
        result = result.substring(0, block.startIndex) +
                 result.substring(block.startIndex + block.fullMatch.length);
      }
    } catch (err) {
      console.error('[email-html-processor] Failed to parse condition JSON:', err);
      // Keep block on parse error
    }
  }

  return result;
}

/** Map frontend operator names to backend operator names */
function mapConditionOperator(condition: BlockCondition): BlockCondition {
  const operatorMap: Record<string, string> = {
    equals: 'eq',
    not_equals: 'neq',
    greater_than: 'gt',
    greater_than_or_equal: 'gte',
    less_than: 'lt',
    less_than_or_equal: 'lte',
    contains: 'contains',
    not_contains: 'not_contains',
    exists: 'exists',
    not_exists: 'not_exists',
  };

  return {
    ...condition,
    operator: (operatorMap[condition.operator] || condition.operator) as BlockCondition['operator'],
  };
}

// ---------------------------------------------------------------------------
// Feature 1 + 5 + 6: Product Blocks
// ---------------------------------------------------------------------------

/**
 * Replace all elements with data-steve-products="true" with real product grids.
 * Uses depth-aware extraction to handle nested HTML correctly.
 */
async function replaceProductBlocks(
  html: string,
  options: ProcessorOptions
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const products = await getProductCatalog(supabase, options.clientId);

  if (products.length === 0) return html;

  const blocks = extractBlocksByAttr(html, 'data-steve-products', 'true');
  if (blocks.length === 0) return html;

  let result = html;

  // Process in reverse order so string indices remain valid
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];

    try {
      // Extract configuration from data attributes
      const productType = extractAttr(block.attrs, 'data-product-type') || 'best_sellers';
      const productCount = parseInt(extractAttr(block.attrs, 'data-product-count') || '4', 10);
      const columns = parseInt(extractAttr(block.attrs, 'data-columns') || '2', 10);
      const showPrice = extractAttr(block.attrs, 'data-show-price') !== 'false';
      const buttonText = extractAttr(block.attrs, 'data-button-text') || 'Ver producto';
      const buttonColor = extractAttr(block.attrs, 'data-button-color') || '#1a1a1a';

      let replacementHtml = '';

      // Feature 5: Abandoned cart uses enrollment metadata line_items
      if (productType === 'abandoned_cart' && options.enrollmentMetadata?.line_items) {
        const lineItems = options.enrollmentMetadata.line_items;
        const cartProductIds = lineItems
          .map((item: any) => String(item.product_id || ''))
          .filter((id: string) => id && id !== 'null');

        let recommendedProducts: any[] = [];

        if (cartProductIds.length > 0) {
          recommendedProducts = cartProductIds
            .map((pid: string) => products.find(p => p.id === pid))
            .filter(Boolean)
            .slice(0, productCount);
        }

        // Fallback: use line_items data directly if products were deleted from catalog
        if (recommendedProducts.length === 0 && lineItems.length > 0) {
          recommendedProducts = lineItems.slice(0, productCount).map((item: any) => ({
            id: String(item.product_id || ''),
            title: item.title || 'Producto',
            handle: '',
            product_type: '',
            image_url: item.image || '',
            price: item.price || '0',
            url: options.enrollmentMetadata?.abandoned_checkout_url || '#',
          }));
        }

        if (recommendedProducts.length > 0) {
          replacementHtml = renderProductGridStyled(recommendedProducts, {
            columns, showPrice, buttonText, buttonColor, count: productCount,
          });
        }
      }

      // Feature 6: For subscriber-specific types, use generateRecommendationBlock
      if (!replacementHtml) {
        const subscriber = options.subscriberId
          ? (await supabase.from('email_subscribers').select('*').eq('id', options.subscriberId).single()).data
          : null;

        replacementHtml = await generateRecommendationBlock(
          supabase,
          products,
          subscriber,
          { type: productType, count: productCount },
          options.clientId
        );

        // If the standard renderer was used but we have custom styling, re-render
        if (!replacementHtml) {
          replacementHtml = renderProductGridStyled(products.slice(0, productCount), {
            columns, showPrice, buttonText, buttonColor, count: productCount,
          });
        }
      }

      if (replacementHtml) {
        result = result.substring(0, block.startIndex) +
                 replacementHtml +
                 result.substring(block.startIndex + block.fullMatch.length);
      }
    } catch (err) {
      console.error('[email-html-processor] Failed to process product block:', err);
      // Leave block as-is on error
    }
  }

  return result;
}

/** Extract a data attribute value from an attributes string (handles both single and double quotes) */
function extractAttr(attrs: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escaped}=(?:"([^"]*)"|'([^']*)')`, 'i');
  const match = attrs.match(regex);
  return match ? (match[1] ?? match[2] ?? null) : null;
}

/** Render a styled product grid with configurable columns, colors, etc. */
function renderProductGridStyled(
  products: any[],
  config: {
    columns: number;
    showPrice: boolean;
    buttonText: string;
    buttonColor: string;
    count: number;
  }
): string {
  const items = products.slice(0, config.count);
  if (items.length === 0) return '';

  const cols = Math.min(config.columns, 4);
  const colWidth = Math.floor(100 / cols);
  const rows: string[] = [];

  for (let i = 0; i < items.length; i += cols) {
    const rowItems = items.slice(i, i + cols);
    const cells = rowItems.map(product => {
      const safeTitle = escapeHtml(product.title || '');
      const safeUrl = escapeHtml(product.url || '#');
      const safeImageUrl = escapeHtml(product.image_url || '');
      const safeBtnText = escapeHtml(config.buttonText);
      const safeBtnColor = escapeHtml(config.buttonColor);

      const price = config.showPrice
        ? `<span style="font-size:14px;color:#666;display:block;margin-bottom:10px;">$${parseFloat(product.price || '0').toLocaleString('es-CL')}</span>`
        : '';
      return `
        <td style="width:${colWidth}%;padding:8px;vertical-align:top;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;">
            ${safeImageUrl ? `
              <tr><td style="padding:0;">
                <a href="${safeUrl}" style="text-decoration:none;">
                  <img src="${safeImageUrl}" alt="${safeTitle}" width="100%" style="display:block;max-width:280px;height:auto;" />
                </a>
              </td></tr>
            ` : ''}
            <tr><td style="padding:12px;">
              <a href="${safeUrl}" style="text-decoration:none;color:#1a1a1a;font-size:14px;font-weight:600;display:block;margin-bottom:4px;">
                ${safeTitle}
              </a>
              ${price}
              <a href="${safeUrl}" style="display:inline-block;background:${safeBtnColor};color:#fff;font-size:13px;padding:8px 20px;border-radius:20px;text-decoration:none;font-weight:500;">
                ${safeBtnText}
              </a>
            </td></tr>
          </table>
        </td>
      `;
    });

    // Pad with empty cells if row is not full
    while (cells.length < cols) {
      cells.push(`<td style="width:${colWidth}%;padding:8px;"></td>`);
    }

    rows.push(`<tr>${cells.join('')}</tr>`);
  }

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td colspan="${cols}" style="padding:0 8px 12px;font-size:18px;font-weight:bold;color:#1a1a1a;font-family:Georgia,serif;">
          Productos recomendados para ti
        </td>
      </tr>
      ${rows.join('')}
    </table>
  `.trim();
}

// ---------------------------------------------------------------------------
// Feature 2: Discount Blocks
// ---------------------------------------------------------------------------

/**
 * Replace all elements with data-steve-discount="true".
 * For shopify_create: generates a unique discount code via Shopify GraphQL.
 * For manual: leaves the code as-is.
 * Uses depth-aware extraction to handle nested HTML correctly.
 */
async function replaceDiscountBlocks(
  html: string,
  options: ProcessorOptions
): Promise<string> {
  const blocks = extractBlocksByAttr(html, 'data-steve-discount', 'true');
  if (blocks.length === 0) return html;

  let result = html;

  // Process in reverse order so string indices remain valid
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];

    try {
      const discountMode = extractAttr(block.attrs, 'data-discount-mode') || 'manual';
      const discountType = (extractAttr(block.attrs, 'data-discount-type') || 'percentage') as 'percentage' | 'fixed_amount' | 'free_shipping';
      const discountValue = parseFloat(extractAttr(block.attrs, 'data-discount-value') || '10');
      const manualCode = extractAttr(block.attrs, 'data-discount-code') || '';
      const minimumPurchase = parseFloat(extractAttr(block.attrs, 'data-minimum-purchase') || '0');
      const expirationDays = parseInt(extractAttr(block.attrs, 'data-expiration-days') || '30', 10);

      let code = manualCode;

      if (discountMode === 'shopify_create') {
        try {
          const subscriberShort = options.subscriberId.substring(0, 6).toUpperCase();
          const random = Math.random().toString(36).substring(2, 6).toUpperCase();
          const uniqueCode = `STEVE-${subscriberShort}-${random}`;

          const createdCode = await createDiscountCode({
            clientId: options.clientId,
            code: uniqueCode,
            discountType,
            discountValue,
            minimumPurchase: minimumPurchase > 0 ? minimumPurchase : undefined,
            usageLimit: 1,
            endsAt: new Date(Date.now() + expirationDays * 86400000).toISOString(),
          });

          code = createdCode || uniqueCode;
        } catch (err) {
          console.error('[email-html-processor] Failed to create Shopify discount:', err);
          code = manualCode || 'STEVE-ERROR';
        }
      }

      // Replace {{discount_code}} placeholders within the block content
      const updatedInner = block.inner.replace(/\{\{\s*discount_code\s*\}\}/g, escapeHtml(code));
      // Reconstruct the block with updated inner content
      const updatedBlock = block.fullMatch.replace(block.inner, updatedInner);
      result = result.substring(0, block.startIndex) +
               updatedBlock +
               result.substring(block.startIndex + block.fullMatch.length);
    } catch (err) {
      console.error('[email-html-processor] Failed to process discount block:', err);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Feature 2 helper: Create discount code via Shopify GraphQL
// ---------------------------------------------------------------------------

interface CreateDiscountParams {
  clientId: string;
  code: string;
  discountType: 'percentage' | 'fixed_amount' | 'free_shipping';
  discountValue: number;
  minimumPurchase?: number;
  usageLimit?: number;
  endsAt?: string;
}

/**
 * Create a discount code in Shopify. Extracted from create-shopify-discount.ts
 * for reuse in the email processor pipeline.
 */
async function createDiscountCode(params: CreateDiscountParams): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: connection } = await supabase
    .from('platform_connections')
    .select('*')
    .eq('client_id', params.clientId)
    .eq('platform', 'shopify')
    .eq('is_active', true)
    .maybeSingle();

  if (!connection) {
    console.error('[createDiscountCode] No Shopify connection for client', params.clientId);
    return null;
  }

  // Decrypt access token
  const { data: tokenData } = await supabase.rpc(
    'decrypt_platform_token',
    { encrypted_token: connection.access_token_encrypted }
  );

  if (!tokenData) {
    console.error('[createDiscountCode] Failed to decrypt access token');
    return null;
  }

  const shopDomain = connection.store_url || `${connection.store_name}.myshopify.com`;

  if (params.discountType === 'free_shipping') {
    const mutation = `
      mutation discountCodeFreeShippingCreate($freeShippingCodeDiscount: DiscountCodeFreeShippingInput!) {
        discountCodeFreeShippingCreate(freeShippingCodeDiscount: $freeShippingCodeDiscount) {
          codeDiscountNode {
            codeDiscount { ... on DiscountCodeFreeShipping { codes(first: 1) { nodes { code } } } }
          }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      freeShippingCodeDiscount: {
        title: `Steve Mail - ${params.code}`,
        code: params.code,
        startsAt: new Date().toISOString(),
        endsAt: params.endsAt || null,
        customerSelection: { all: true },
        destination: { all: true },
        usageLimit: params.usageLimit || null,
        appliesOncePerCustomer: true,
      },
    };

    const res = await fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': tokenData, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: mutation, variables }),
    });

    if (!res.ok) return null;

    const result: any = await res.json();
    const errors = result.data?.discountCodeFreeShippingCreate?.userErrors;
    if (errors?.length > 0) {
      console.error('[createDiscountCode] Shopify errors:', errors);
      return null;
    }

    return result.data?.discountCodeFreeShippingCreate?.codeDiscountNode
      ?.codeDiscount?.codes?.nodes?.[0]?.code || params.code;
  }

  // Percentage / Fixed amount
  const mutation = `
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          codeDiscount { ... on DiscountCodeBasic { codes(first: 1) { nodes { code } } } }
        }
        userErrors { field message }
      }
    }
  `;

  const customerGets = params.discountType === 'percentage'
    ? { value: { percentage: params.discountValue / 100 }, items: { all: true } }
    : { value: { discountAmount: { amount: params.discountValue, appliesOnEachItem: false } }, items: { all: true } };

  const minimumRequirement = params.minimumPurchase && params.minimumPurchase > 0
    ? { subtotal: { greaterThanOrEqualToSubtotal: params.minimumPurchase } }
    : null;

  const variables = {
    basicCodeDiscount: {
      title: `Steve Mail - ${params.code}`,
      code: params.code,
      startsAt: new Date().toISOString(),
      endsAt: params.endsAt || null,
      customerSelection: { all: true },
      customerGets,
      minimumRequirement,
      usageLimit: params.usageLimit || null,
      appliesOncePerCustomer: true,
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true },
    },
  };

  const res = await fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': tokenData, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: mutation, variables }),
  });

  if (!res.ok) return null;

  const result: any = await res.json();
  const errors = result.data?.discountCodeBasicCreate?.userErrors;
  if (errors?.length > 0) {
    console.error('[createDiscountCode] Shopify errors:', errors);
    return null;
  }

  return result.data?.discountCodeBasicCreate?.codeDiscountNode
    ?.codeDiscount?.codes?.nodes?.[0]?.code || params.code;
}
