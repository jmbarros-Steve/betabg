-- Drop and recreate the encrypt function with proper ownership
DROP FUNCTION IF EXISTS public.encrypt_platform_token(text);

CREATE OR REPLACE FUNCTION public.encrypt_platform_token(raw_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
DECLARE
  key_id UUID;
  encrypted BYTEA;
BEGIN
  IF raw_token IS NULL OR raw_token = '' THEN
    RETURN NULL;
  END IF;
  
  -- Get the encryption key
  SELECT id INTO key_id FROM pgsodium.valid_key WHERE name = 'platform_tokens_key' LIMIT 1;
  
  IF key_id IS NULL THEN
    RAISE EXCEPTION 'Encryption key not found';
  END IF;
  
  -- Encrypt the token using AEAD deterministic encryption
  encrypted := pgsodium.crypto_aead_det_encrypt(
    raw_token::bytea,
    ''::bytea,
    key_id
  );
  
  -- Return as base64 string for storage
  RETURN encode(encrypted, 'base64');
END;
$$;

-- Ensure the function can be executed by service_role
GRANT EXECUTE ON FUNCTION public.encrypt_platform_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_platform_token(text) TO authenticated;