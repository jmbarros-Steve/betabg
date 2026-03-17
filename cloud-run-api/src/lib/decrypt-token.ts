/**
 * Safe wrapper for decrypt_platform_token RPC.
 * Prevents PGRST102 by validating the encrypted token before calling RPC.
 * PGRST102 occurs when `encrypted_token` is undefined — JSON.stringify strips
 * undefined values, so PostgREST receives 0 params and can't find the function.
 */
export async function decryptPlatformToken(
  supabase: any,
  encryptedToken: string | null | undefined
): Promise<string | null> {
  if (!encryptedToken || typeof encryptedToken !== 'string' || encryptedToken.trim() === '') {
    return null;
  }

  const { data, error } = await supabase.rpc('decrypt_platform_token', {
    encrypted_token: encryptedToken,
  });

  if (error) {
    console.error('[decryptPlatformToken] RPC error:', error.message, error.code);
    return null;
  }

  return data as string | null;
}
