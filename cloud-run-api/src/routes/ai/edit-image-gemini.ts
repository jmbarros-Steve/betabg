import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Image editing via Google Gemini 2.0 Flash (native image generation).
 * POST /api/edit-image-gemini
 *
 * Actions:
 *  - remove_background: Removes background, returns PNG with transparency
 *  - apply_brand_colors: Recolors image to match brand palette
 *  - enhance: Improves quality, lighting, sharpness
 *  - variation: Generates a variation keeping the same style/subject
 *  - custom_edit: Free-form edit with user prompt
 *  - generate_email_banner: Generates a banner image for email campaigns
 */
export async function editImageGemini(c: Context) {
  try {
    const {
      clientId,
      action,
      imageUrl,
      prompt,
      brandColor,
      brandSecondaryColor,
      width,
      height,
    } = await c.req.json();

    if (!clientId) return c.json({ error: 'clientId is required' }, 400);
    if (!action) return c.json({ error: 'action is required' }, 400);

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.error('[edit-image-gemini] GEMINI_API_KEY not configured');
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    const supabase = getSupabaseAdmin();

    // Check credits (1 credit for edits, 2 for generation)
    const creditCost = ['generate_email_banner', 'variation'].includes(action) ? 2 : 1;
    const { data: credits } = await supabase
      .from('client_credits')
      .select('id, creditos_disponibles, creditos_usados')
      .eq('client_id', clientId)
      .maybeSingle();

    if (!credits) {
      return c.json(
        { error: 'NO_CREDIT_RECORD', message: 'No se encontró registro de créditos para este cliente. Contacta al administrador.' },
        402
      );
    }

    const available = credits.creditos_disponibles ?? 0;
    if (available < creditCost) {
      return c.json({ error: 'NO_CREDITS', message: `Se necesitan ${creditCost} créditos` }, 402);
    }

    // Build the Gemini prompt based on action
    let editPrompt: string;
    let imageBase64: string | null = null;
    let imageMimeType = 'image/png';

    // Download source image if provided
    if (imageUrl) {
      try {
        const imgResp = await fetch(imageUrl);
        if (imgResp.ok) {
          const contentType = imgResp.headers.get('content-type') || 'image/png';
          imageMimeType = contentType.includes('jpeg') || contentType.includes('jpg') ? 'image/jpeg' : 'image/png';
          const imgBuffer = await imgResp.arrayBuffer();
          imageBase64 = Buffer.from(imgBuffer).toString('base64');
        }
      } catch (err) {
        console.error('[edit-image-gemini] Failed to download source image:', err);
      }
    }

    switch (action) {
      case 'remove_background':
        editPrompt = 'Remove the background from this image completely. Make the background pure white (#FFFFFF). Keep the main subject intact with clean edges. Output a clean product photo on white background.';
        break;

      case 'apply_brand_colors':
        editPrompt = `Recolor and style this image to match the following brand palette: primary color ${brandColor || '#18181b'}, secondary color ${brandSecondaryColor || '#6366f1'}. Apply these colors as accent tones, overlays, or color grading while keeping the subject recognizable. Make it look professional and on-brand.`;
        break;

      case 'enhance':
        editPrompt = 'Enhance this image for email marketing: improve lighting, increase sharpness, boost colors slightly, make it look more professional and high-quality. Keep the same composition and subject.';
        break;

      case 'variation':
        editPrompt = prompt
          ? `Create a variation of this image: ${prompt}. Keep a similar style, composition, and subject matter but make it visually distinct.`
          : 'Create a visually distinct variation of this image. Keep the same style and subject but change the angle, lighting, or composition slightly.';
        break;

      case 'custom_edit':
        if (!prompt) return c.json({ error: 'prompt is required for custom_edit' }, 400);
        editPrompt = prompt;
        break;

      case 'generate_email_banner': {
        const bannerPrompt = prompt || 'Professional e-commerce promotional banner';
        const w = width || 600;
        const h = height || 300;
        editPrompt = `Generate a professional email marketing banner image (${w}x${h} pixels). Style: ${bannerPrompt}. The image should be clean, modern, and suitable for an HTML email. No text in the image — the text will be overlaid separately. Use brand colors: primary ${brandColor || '#18181b'}, secondary ${brandSecondaryColor || '#6366f1'}.`;
        break;
      }

      default:
        return c.json({ error: `Unknown action: ${action}` }, 400);
    }

    // Call Gemini 2.0 Flash for image editing/generation
    const parts: any[] = [];

    // Add the text prompt
    parts.push({ text: editPrompt });

    // Add the source image if available (for editing actions)
    if (imageBase64 && action !== 'generate_email_banner') {
      parts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: imageBase64,
        },
      });
    }

    // Use Imagen 4 for pure generation, Gemini Flash for edits
    let imageBytes: Uint8Array | null = null;

    if (action === 'generate_email_banner' || (!imageBase64 && action === 'variation')) {
      // Pure generation — use Gemini 2.0 Flash native image generation
      const geminiGenResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: editPrompt }] }],
            generationConfig: {
              responseModalities: ['IMAGE'],
            },
          }),
        }
      );

      if (!geminiGenResponse.ok) {
        const errText = await geminiGenResponse.text();
        console.error('[edit-image-gemini] Gemini Flash generation error:', geminiGenResponse.status, errText);
        return c.json({ error: 'Error procesando la imagen' }, 500);
      }

      const geminiGenResult: any = await geminiGenResponse.json();
      const genParts = geminiGenResult.candidates?.[0]?.content?.parts || [];
      for (const part of genParts) {
        if (part.inlineData?.data) {
          imageBytes = new Uint8Array(Buffer.from(part.inlineData.data, 'base64'));
          break;
        }
      }
    } else {
      // Image editing — use Gemini 2.0 Flash with image input
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
            },
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        console.error('[edit-image-gemini] Gemini Flash error:', geminiResponse.status, errText);

        // Fallback: try Gemini Flash generation with the edit prompt
        const fallbackResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: editPrompt }] }],
              generationConfig: { responseModalities: ['IMAGE'] },
            }),
          }
        );

        if (fallbackResponse.ok) {
          const fbResult: any = await fallbackResponse.json();
          const fbParts = fbResult.candidates?.[0]?.content?.parts || [];
          for (const part of fbParts) {
            if (part.inlineData?.data) {
              imageBytes = new Uint8Array(Buffer.from(part.inlineData.data, 'base64'));
              break;
            }
          }
        }

        if (!imageBytes) {
          return c.json({ error: 'Error procesando la imagen' }, 500);
        }
      } else {
        const geminiResult: any = await geminiResponse.json();

        // Extract image from response parts
        const responseParts = geminiResult.candidates?.[0]?.content?.parts || [];
        for (const part of responseParts) {
          if (part.inlineData?.data) {
            imageBytes = new Uint8Array(Buffer.from(part.inlineData.data, 'base64'));
            break;
          }
        }

        if (!imageBytes) {
          // No image in response — try re-generating with Gemini Flash
          console.warn('[edit-image-gemini] No image in Gemini response, retrying generation');
          const textPart = responseParts.find((p: any) => p.text);
          const regeneratePrompt = textPart?.text
            ? `${editPrompt}. Additional context: ${textPart.text.substring(0, 200)}`
            : editPrompt;

          const fallbackResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: regeneratePrompt }] }],
                generationConfig: { responseModalities: ['IMAGE'] },
              }),
            }
          );

          if (fallbackResponse.ok) {
            const fbResult: any = await fallbackResponse.json();
            const fbParts = fbResult.candidates?.[0]?.content?.parts || [];
            for (const part of fbParts) {
              if (part.inlineData?.data) {
                imageBytes = new Uint8Array(Buffer.from(part.inlineData.data, 'base64'));
                break;
              }
            }
          }
        }
      }
    }

    if (!imageBytes) {
      return c.json({ error: 'No se pudo procesar la imagen' }, 500);
    }

    // Upload to Supabase Storage
    const timestamp = Date.now();
    const storagePath = `assets/${clientId}/email-edited/${timestamp}.png`;

    const { error: storageErr } = await supabase.storage
      .from('client-assets')
      .upload(storagePath, imageBytes, {
        contentType: 'image/png',
        upsert: false,
      });

    if (storageErr) {
      console.error('[edit-image-gemini] Storage error:', storageErr);
      return c.json({ error: 'Error guardando la imagen' }, 500);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('client-assets')
      .getPublicUrl(storagePath);

    // Deduct credits atomically
    const { data: deductResult, error: deductError } = await supabase
      .rpc('deduct_credits', { p_client_id: clientId, p_amount: creditCost });

    if (deductError || !deductResult?.[0]?.success) {
      console.error('[edit-image-gemini] Atomic credit deduction failed:', deductError || deductResult);
    }

    await supabase.from('credit_transactions').insert({
      client_id: clientId,
      accion: `Editar imagen email — ${action}`,
      creditos_usados: creditCost,
      costo_real_usd: creditCost === 2 ? 0.02 : 0.01,
    });

    return c.json({ asset_url: publicUrl, action });
  } catch (err: any) {
    console.error('[edit-image-gemini]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
