import { getSupabaseAdmin } from '../lib/supabase.js';

/**
 * 5 system templates for Steve Mail (Unlayer design JSON).
 * Run via POST /api/seed-email-templates
 */

const SYSTEM_TEMPLATES = [
  {
    name: 'Bienvenida',
    description: 'Email de bienvenida para nuevos suscriptores',
    category: 'bienvenida',
    design_json: {
      body: {
        rows: [
          // Header
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: { text: '<h1 style="margin:0;text-align:center;font-size:24px;color:#18181b;">Tu Marca</h1>' },
              }],
            }],
          },
          // Divider
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'divider',
                values: { width: '100%', border: { borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: '#e5e7eb' }, padding: '10px 0' },
              }],
            }],
          },
          // Hero
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'heading',
                values: { text: '<h2 style="margin:0;text-align:center;color:#18181b;">¡Bienvenido/a, {{first_name}}!</h2>' },
              }],
            }],
          },
          // Body text
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<p style="font-size:15px;line-height:1.6;color:#374151;text-align:center;">Estamos muy contentos de que te hayas unido a nuestra comunidad. Aquí encontrarás las mejores ofertas, novedades y contenido exclusivo.</p><p style="font-size:15px;line-height:1.6;color:#374151;text-align:center;">Preparamos algo especial para ti como nuevo miembro.</p>',
                },
              }],
            }],
          },
          // CTA
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'button',
                values: {
                  text: 'Conocer la tienda',
                  href: { name: 'web', values: { href: '#', target: '_blank' } },
                  buttonColors: { color: '#ffffff', backgroundColor: '#2563eb' },
                  size: { autoWidth: false, width: '50%' },
                  textAlign: 'center',
                  lineHeight: '120%',
                  padding: '12px 24px',
                  borderRadius: '8px',
                },
              }],
            }],
          },
          // Footer
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:24px;">Si no deseas recibir más emails, <a href="{{unsubscribe_url}}" style="color:#6b7280;">desuscríbete aquí</a>.</p>',
                },
              }],
            }],
          },
        ],
        values: {
          backgroundColor: '#f9fafb',
          contentWidth: '600px',
          fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        },
      },
    },
  },
  {
    name: 'Promocional',
    description: 'Email de ofertas y descuentos',
    category: 'promocional',
    design_json: {
      body: {
        rows: [
          // Header
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: { text: '<h1 style="margin:0;text-align:center;font-size:22px;color:#18181b;">Tu Marca</h1>' },
              }],
            }],
          },
          // Hero banner
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'heading',
                values: {
                  text: '<h1 style="margin:0;text-align:center;font-size:32px;color:#dc2626;">¡OFERTA ESPECIAL!</h1>',
                },
              }],
            }],
          },
          // Subtext
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<p style="font-size:18px;text-align:center;color:#374151;">Hasta <strong>30% de descuento</strong> en productos seleccionados</p><p style="font-size:14px;text-align:center;color:#6b7280;">Solo por tiempo limitado. ¡No te lo pierdas!</p>',
                },
              }],
            }],
          },
          // Product 1
          {
            cells: [1, 1],
            columns: [
              {
                contents: [{
                  type: 'text',
                  values: {
                    text: '<div style="text-align:center;padding:12px;"><p style="font-weight:700;font-size:16px;color:#18181b;">Producto Destacado 1</p><p style="font-size:18px;color:#dc2626;font-weight:600;">$19.990</p><p style="font-size:13px;color:#9ca3af;text-decoration:line-through;">$29.990</p></div>',
                  },
                }],
              },
              {
                contents: [{
                  type: 'text',
                  values: {
                    text: '<div style="text-align:center;padding:12px;"><p style="font-weight:700;font-size:16px;color:#18181b;">Producto Destacado 2</p><p style="font-size:18px;color:#dc2626;font-weight:600;">$24.990</p><p style="font-size:13px;color:#9ca3af;text-decoration:line-through;">$39.990</p></div>',
                  },
                }],
              },
            ],
          },
          // CTA
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'button',
                values: {
                  text: 'Ver todas las ofertas',
                  href: { name: 'web', values: { href: '#', target: '_blank' } },
                  buttonColors: { color: '#ffffff', backgroundColor: '#dc2626' },
                  size: { autoWidth: false, width: '60%' },
                  textAlign: 'center',
                  padding: '14px 28px',
                  borderRadius: '8px',
                },
              }],
            }],
          },
          // Urgency
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<p style="font-size:13px;text-align:center;color:#f59e0b;font-weight:600;">Oferta válida hasta agotar stock</p>',
                },
              }],
            }],
          },
          // Footer
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:24px;">No quieres recibir ofertas? <a href="{{unsubscribe_url}}" style="color:#6b7280;">Desuscríbete</a></p>',
                },
              }],
            }],
          },
        ],
        values: {
          backgroundColor: '#ffffff',
          contentWidth: '600px',
          fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        },
      },
    },
  },
  {
    name: 'Nuevo Producto',
    description: 'Email de lanzamiento de producto',
    category: 'producto',
    design_json: {
      body: {
        rows: [
          // Header
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: { text: '<h1 style="margin:0;text-align:center;font-size:22px;color:#18181b;">Tu Marca</h1>' },
              }],
            }],
          },
          // Nuevo badge
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<div style="text-align:center;"><span style="display:inline-block;background:#2563eb;color:#fff;padding:4px 16px;border-radius:20px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Nuevo</span></div>',
                },
              }],
            }],
          },
          // Product hero
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'heading',
                values: {
                  text: '<h2 style="margin:8px 0;text-align:center;font-size:28px;color:#18181b;">Presentamos: Nombre del Producto</h2>',
                },
              }],
            }],
          },
          // Description
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<p style="font-size:15px;line-height:1.6;color:#374151;text-align:center;max-width:480px;margin:0 auto;">Diseñado con los mejores materiales y pensado para ti. Este nuevo producto es el complemento perfecto para tu día a día.</p>',
                },
              }],
            }],
          },
          // Price + CTA
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<p style="text-align:center;font-size:24px;font-weight:700;color:#18181b;margin:16px 0 4px;">$39.990</p>',
                },
              }],
            }],
          },
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'button',
                values: {
                  text: 'Lo quiero',
                  href: { name: 'web', values: { href: '#', target: '_blank' } },
                  buttonColors: { color: '#ffffff', backgroundColor: '#18181b' },
                  size: { autoWidth: false, width: '40%' },
                  textAlign: 'center',
                  padding: '12px 24px',
                  borderRadius: '8px',
                },
              }],
            }],
          },
          // Review
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<div style="background:#f9fafb;border-radius:12px;padding:20px;margin:16px 24px;text-align:center;"><p style="color:#f59e0b;font-size:20px;margin:0 0 8px;">★★★★★</p><p style="font-style:italic;color:#374151;font-size:14px;margin:0 0 8px;">"Increíble calidad, superó mis expectativas"</p><p style="color:#6b7280;font-size:13px;font-weight:600;margin:0;">— Cliente Early Access</p></div>',
                },
              }],
            }],
          },
          // Footer
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:24px;"><a href="{{unsubscribe_url}}" style="color:#6b7280;">Desuscribirse</a></p>',
                },
              }],
            }],
          },
        ],
        values: {
          backgroundColor: '#ffffff',
          contentWidth: '600px',
          fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        },
      },
    },
  },
  {
    name: 'Newsletter',
    description: 'Newsletter con contenido periódico',
    category: 'newsletter',
    design_json: {
      body: {
        rows: [
          // Header
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: { text: '<h1 style="margin:0;text-align:center;font-size:22px;color:#18181b;">Tu Marca — Newsletter</h1>' },
              }],
            }],
          },
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'divider',
                values: { width: '100%', border: { borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: '#e5e7eb' }, padding: '8px 0' },
              }],
            }],
          },
          // Greeting
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<p style="font-size:16px;color:#18181b;">Hola {{first_name}},</p><p style="font-size:15px;line-height:1.6;color:#374151;">Estas son las novedades de esta semana. ¡Esperamos que te gusten!</p>',
                },
              }],
            }],
          },
          // Section 1
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<h3 style="color:#18181b;font-size:18px;margin:0 0 8px;border-left:4px solid #2563eb;padding-left:12px;">Artículo Destacado</h3><p style="font-size:14px;line-height:1.6;color:#374151;">Contenido interesante que tus suscriptores van a querer leer. Comparte tips, historias de marca o novedades de la industria.</p>',
                },
              }],
            }],
          },
          // Section 2
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<h3 style="color:#18181b;font-size:18px;margin:0 0 8px;border-left:4px solid #10b981;padding-left:12px;">Tip de la Semana</h3><p style="font-size:14px;line-height:1.6;color:#374151;">Un consejo práctico que agrega valor a la vida de tu audiencia y los mantiene comprometidos con tu marca.</p>',
                },
              }],
            }],
          },
          // Section 3
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<h3 style="color:#18181b;font-size:18px;margin:0 0 8px;border-left:4px solid #f59e0b;padding-left:12px;">Lo que viene</h3><p style="font-size:14px;line-height:1.6;color:#374151;">Anticipa lo que viene próximamente: nuevos productos, eventos, colaboraciones o contenido exclusivo.</p>',
                },
              }],
            }],
          },
          // Social / CTA
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<div style="text-align:center;padding:16px 0;"><p style="font-size:13px;color:#6b7280;margin:0 0 8px;">Síguenos en redes para más contenido</p><p style="margin:0;font-size:14px;"><a href="#" style="color:#2563eb;text-decoration:none;margin:0 8px;">Instagram</a> · <a href="#" style="color:#2563eb;text-decoration:none;margin:0 8px;">Facebook</a> · <a href="#" style="color:#2563eb;text-decoration:none;margin:0 8px;">TikTok</a></p></div>',
                },
              }],
            }],
          },
          // Footer
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:16px;"><a href="{{unsubscribe_url}}" style="color:#6b7280;">Desuscribirse</a></p>',
                },
              }],
            }],
          },
        ],
        values: {
          backgroundColor: '#ffffff',
          contentWidth: '600px',
          fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        },
      },
    },
  },
  {
    name: 'Recuperación de Carrito',
    description: 'Email para carrito abandonado',
    category: 'carrito',
    design_json: {
      body: {
        rows: [
          // Header
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: { text: '<h1 style="margin:0;text-align:center;font-size:22px;color:#18181b;">Tu Marca</h1>' },
              }],
            }],
          },
          // Hero
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'heading',
                values: {
                  text: '<h2 style="margin:0;text-align:center;font-size:26px;color:#18181b;">¡Dejaste algo en tu carrito!</h2>',
                },
              }],
            }],
          },
          // Body
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<p style="font-size:15px;line-height:1.6;color:#374151;text-align:center;">Hola {{first_name}}, notamos que dejaste productos en tu carrito. ¡No dejes que se agoten!</p>',
                },
              }],
            }],
          },
          // Product placeholder
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:0 24px;text-align:center;"><p style="font-weight:700;font-size:16px;color:#18181b;margin:0 0 4px;">Tu producto seleccionado</p><p style="font-size:18px;color:#18181b;margin:0;">{{cart_total}}</p></div>',
                },
              }],
            }],
          },
          // CTA
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'button',
                values: {
                  text: 'Completar mi compra',
                  href: { name: 'web', values: { href: '{{cart_url}}', target: '_blank' } },
                  buttonColors: { color: '#ffffff', backgroundColor: '#2563eb' },
                  size: { autoWidth: false, width: '55%' },
                  textAlign: 'center',
                  padding: '14px 28px',
                  borderRadius: '8px',
                },
              }],
            }],
          },
          // Coupon
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<div style="background:#fef3c7;border:2px dashed #f59e0b;border-radius:12px;padding:16px;margin:8px 24px;text-align:center;"><p style="font-size:13px;color:#92400e;margin:0 0 4px;">Usa este código para un descuento extra:</p><p style="font-size:22px;font-weight:800;letter-spacing:3px;color:#92400e;font-family:monospace;margin:0;">VUELVE10</p></div>',
                },
              }],
            }],
          },
          // Footer
          {
            cells: [1],
            columns: [{
              contents: [{
                type: 'text',
                values: {
                  text: '<p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:24px;"><a href="{{unsubscribe_url}}" style="color:#6b7280;">Desuscribirse</a></p>',
                },
              }],
            }],
          },
        ],
        values: {
          backgroundColor: '#ffffff',
          contentWidth: '600px',
          fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        },
      },
    },
  },
];

/**
 * Seed system email templates into Supabase.
 * Idempotent: skips templates that already exist by name + is_system.
 *
 * Note: email_templates.client_id has NOT NULL + FK(clients) constraint.
 * System templates (is_system=true) are visible to all clients via service role,
 * so we use the first available client_id as a placeholder owner.
 */
export async function seedSystemEmailTemplates() {
  const supabase = getSupabaseAdmin();
  const results: string[] = [];

  // Get a valid client_id to satisfy the NOT NULL + FK constraint
  // System templates are queried by is_system=true (not by client_id), so any valid client works
  const { data: anyClient } = await supabase
    .from('clients')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const systemClientId = anyClient?.id;
  if (!systemClientId) {
    return { results: ['ERROR: No clients found — cannot seed system templates'], total: 0 };
  }

  for (const tpl of SYSTEM_TEMPLATES) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('email_templates')
      .select('id')
      .eq('name', tpl.name)
      .eq('is_system', true)
      .maybeSingle();

    if (existing) {
      // Update existing template
      const { error } = await supabase
        .from('email_templates')
        .update({
          description: tpl.description,
          category: tpl.category,
          design_json: tpl.design_json,
        })
        .eq('id', existing.id);
      results.push(error ? `${tpl.name}: ERROR ${error.message}` : `${tpl.name}: actualizado`);
    } else {
      // Insert new with valid client_id placeholder
      const { error } = await supabase
        .from('email_templates')
        .insert({
          client_id: systemClientId,
          name: tpl.name,
          description: tpl.description,
          category: tpl.category,
          design_json: tpl.design_json,
          is_system: true,
        });
      results.push(error ? `${tpl.name}: ERROR ${error.message}` : `${tpl.name}: creado`);
    }
  }

  return { results, total: SYSTEM_TEMPLATES.length };
}
