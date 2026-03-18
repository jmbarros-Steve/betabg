import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function uploadEmailImage(c: Context) {
  const supabase = getSupabaseAdmin();

  // Verify JWT
  const authHeader = c.req.header('Authorization');
  if (!authHeader) return c.json({ error: 'Missing authorization header' }, 401);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return c.json({ error: 'Invalid token' }, 401);

  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file uploaded' }, 400);
  }

  // Validate file
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  if (file.size > MAX_SIZE) {
    return c.json({ error: 'File too large. Maximum: 5MB' }, 400);
  }

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  if (!ALLOWED_TYPES.includes(file.type)) {
    return c.json({ error: 'Invalid file type. Allowed: JPG, PNG, WebP' }, 400);
  }

  // Generate unique filename
  const ext = file.name.split('.').pop() || 'jpg';
  const filename = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  // Upload to Supabase Storage
  const arrayBuffer = await file.arrayBuffer();
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('email-images')
    .upload(filename, arrayBuffer, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    });

  if (uploadError) {
    console.error('[upload-email-image] Upload error:', uploadError);
    return c.json({ error: 'Upload failed: ' + uploadError.message }, 500);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('email-images')
    .getPublicUrl(filename);

  return c.json({
    success: true,
    url: urlData.publicUrl,
    filename: filename,
  });
}
