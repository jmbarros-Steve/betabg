import * as nunjucks from 'nunjucks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubscriberData {
  first_name?: string;
  last_name?: string;
  email: string;
  tags?: string[];
  total_orders?: number;
  total_spent?: number;
  last_order_at?: string;
  custom_fields?: Record<string, unknown>;
}

export interface BrandInfo {
  name?: string;
  logo_url?: string;
  color?: string;
  secondary_color?: string;
  font?: string;
  shop_url?: string;
}

export interface ProductItem {
  id?: string;
  title: string;
  price?: number;
  compare_at_price?: number;
  image_url?: string;
  url?: string;
  description?: string;
  [key: string]: unknown;
}

export interface TemplateMetadata {
  cart_url?: string;
  cart_total?: number;
  discount_code?: string;
  unsubscribe_url?: string;
  [key: string]: unknown;
}

export interface BlockCondition {
  field: string;
  operator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'not_contains'
    | 'exists'
    | 'not_exists';
  value?: unknown;
}

export interface TemplateContext {
  person: {
    first_name: string;
    last_name: string;
    email: string;
    full_name: string;
    tags: string[];
    total_orders: number;
    total_spent: number;
    last_order_at: string;
    custom_fields: Record<string, unknown>;
  };
  brand: {
    name: string;
    logo_url: string;
    color: string;
    secondary_color: string;
    font: string;
    shop_url: string;
  };
  cart: {
    url: string;
    total: number;
  };
  products: ProductItem[];
  discount_code: string;
  unsubscribe_url: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Nunjucks environment (singleton)
// ---------------------------------------------------------------------------

const env = new nunjucks.Environment(null, {
  autoescape: false, // HTML emails — we trust the template content
  throwOnUndefined: false, // gracefully handle missing variables
});

// ---------------------------------------------------------------------------
// Custom filters
// ---------------------------------------------------------------------------

/**
 * Formats a number as currency.
 * Usage: {{ product.price | currency }}         -> $12.990
 *        {{ product.price | currency('USD') }}  -> $12.99
 */
env.addFilter('currency', (value: unknown, currencyCode?: string) => {
  const num = Number(value);
  if (isNaN(num)) return String(value ?? '');

  const code = (currencyCode ?? 'CLP').toUpperCase();

  if (code === 'CLP') {
    // Chilean peso: no decimals, dot as thousands separator
    return '$' + Math.round(num).toLocaleString('es-CL');
  }

  // Default: 2 decimals
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
  }).format(num);
});

/**
 * Formats an ISO date string into a readable Spanish date.
 * Usage: {{ person.last_order_at | date_format }}  -> "10 de marzo de 2026"
 */
env.addFilter('date_format', (value: unknown, format?: string) => {
  if (!value) return '';
  const date = new Date(String(value));
  if (isNaN(date.getTime())) return String(value);

  if (format === 'short') {
    return date.toLocaleDateString('es-CL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  // Default: long format
  return date.toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
});

/**
 * Capitalizes the first letter of a string.
 * Usage: {{ person.first_name | capitalize_first }}
 */
env.addFilter('capitalize_first', (value: unknown) => {
  const str = String(value ?? '');
  if (str.length === 0) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
});

/**
 * Truncates text to N words, appending "..." if truncated.
 * Usage: {{ product.description | truncate_words(15) }}
 */
env.addFilter('truncate_words', (value: unknown, count?: number) => {
  const str = String(value ?? '');
  const limit = count ?? 20;
  const words = str.split(/\s+/);
  if (words.length <= limit) return str;
  return words.slice(0, limit).join(' ') + '...';
});

// ---------------------------------------------------------------------------
// buildTemplateContext
// ---------------------------------------------------------------------------

/**
 * Assembles the full template context object from its constituent parts.
 * Every field is guaranteed to have a safe default so templates never
 * encounter undefined values for standard merge tags.
 */
export function buildTemplateContext(
  subscriber: SubscriberData,
  metadata?: TemplateMetadata,
  brandInfo?: BrandInfo,
  products?: ProductItem[]
): TemplateContext {
  const firstName = subscriber.first_name ?? '';
  const lastName = subscriber.last_name ?? '';

  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  const brandName = brandInfo?.name ?? '';
  const shopUrl = brandInfo?.shop_url ?? '';
  const brandColor = brandInfo?.color ?? '#000000';
  const discountCode = metadata?.discount_code ?? '';
  const unsubUrl = metadata?.unsubscribe_url ?? '';

  return {
    person: {
      first_name: firstName,
      last_name: lastName,
      email: subscriber.email,
      full_name: fullName,
      tags: subscriber.tags ?? [],
      total_orders: subscriber.total_orders ?? 0,
      total_spent: subscriber.total_spent ?? 0,
      last_order_at: subscriber.last_order_at ?? '',
      custom_fields: subscriber.custom_fields ?? {},
    },
    brand: {
      name: brandName,
      logo_url: brandInfo?.logo_url ?? '',
      color: brandColor,
      secondary_color: brandInfo?.secondary_color ?? '#666666',
      font: brandInfo?.font ?? 'Arial, sans-serif',
      shop_url: shopUrl,
    },
    cart: {
      url: metadata?.cart_url ?? '',
      total: metadata?.cart_total ?? 0,
    },
    products: products ?? [],
    discount_code: discountCode,
    unsubscribe_url: unsubUrl,

    // Flat aliases (English) — so {{ first_name }} works without person. prefix
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    email: subscriber.email,
    brand_name: brandName,
    shop_url: shopUrl,
    brand_color: brandColor,

    // Spanish aliases — so {{ nombre }}, {{ empresa }} etc. work
    nombre: firstName,
    apellido: lastName,
    nombre_completo: fullName,
    empresa: brandName,
    tienda_url: shopUrl,
    color_marca: brandColor,
  };
}

// ---------------------------------------------------------------------------
// renderEmailTemplate
// ---------------------------------------------------------------------------

/**
 * Renders an HTML email template using Nunjucks.
 *
 * Supports the full Nunjucks syntax: {{ variables }}, {% if %}, {% for %},
 * filters, etc.  If rendering fails for any reason the original HTML is
 * returned unchanged so emails are never completely broken.
 *
 * @param html    Raw HTML template string
 * @param context The context object (typically from buildTemplateContext)
 * @returns       Rendered HTML string
 */
export function renderEmailTemplate(
  html: string,
  context: TemplateContext | Record<string, unknown>
): string {
  try {
    return env.renderString(html, context);
  } catch (error) {
    console.error(
      '[template-engine] Nunjucks render failed, returning original HTML:',
      error instanceof Error ? error.message : error
    );
    return html;
  }
}

// ---------------------------------------------------------------------------
// evaluateBlockConditions
// ---------------------------------------------------------------------------

/**
 * Resolves a dot-notation field path against a nested object.
 * e.g. resolveField({ person: { total_orders: 5 } }, 'person.total_orders') -> 5
 */
function resolveField(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current !== null && current !== undefined && typeof current === 'object') {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Evaluates an array of block conditions against a template context.
 * All conditions must pass (logical AND) for the result to be `true`.
 *
 * Supported operators:
 *   eq, neq, gt, gte, lt, lte, contains, not_contains, exists, not_exists
 *
 * @param conditions  Array of condition objects
 * @param context     The template context to evaluate against
 * @returns           true if ALL conditions pass, false otherwise
 */
export function evaluateBlockConditions(
  conditions: BlockCondition[],
  context: TemplateContext | Record<string, unknown>
): boolean {
  if (!conditions || conditions.length === 0) return true;

  return conditions.every((condition) => {
    const fieldValue = resolveField(context as Record<string, unknown>, condition.field);

    switch (condition.operator) {
      case 'eq':
        // Loose equality to handle string/number comparisons (e.g. "5" == 5)
        // eslint-disable-next-line eqeqeq
        return fieldValue == condition.value;

      case 'neq':
        // eslint-disable-next-line eqeqeq
        return fieldValue != condition.value;

      case 'gt':
        return Number(fieldValue) > Number(condition.value);

      case 'gte':
        return Number(fieldValue) >= Number(condition.value);

      case 'lt':
        return Number(fieldValue) < Number(condition.value);

      case 'lte':
        return Number(fieldValue) <= Number(condition.value);

      case 'contains': {
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(condition.value);
        }
        return String(fieldValue ?? '').includes(String(condition.value ?? ''));
      }

      case 'not_contains': {
        if (Array.isArray(fieldValue)) {
          return !fieldValue.includes(condition.value);
        }
        return !String(fieldValue ?? '').includes(String(condition.value ?? ''));
      }

      case 'exists':
        return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';

      case 'not_exists':
        return fieldValue === undefined || fieldValue === null || fieldValue === '';

      default:
        console.warn(`[template-engine] Unknown operator: ${condition.operator}`);
        return false;
    }
  });
}
