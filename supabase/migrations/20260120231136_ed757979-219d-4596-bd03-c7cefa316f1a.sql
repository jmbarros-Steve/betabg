-- Use pgcrypto instead of pgsodium for encryption
-- First ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop and recreate the encrypt function using pgcrypto
DROP FUNCTION IF EXISTS public.encrypt_platform_token(text);

CREATE OR REPLACE FUNCTION public.encrypt_platform_token(raw_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key text;
  encrypted_bytes bytea;
BEGIN
  IF raw_token IS NULL OR raw_token = '' THEN
    RETURN NULL;
  END IF;
  
  -- Use a fixed encryption key derived from the database 
  -- In production, this should come from a secure source
  encryption_key := current_setting('app.settings.encryption_key', true);
  
  -- Fallback to a derived key if not set
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := encode(digest('platform_tokens_secret_key_2024', 'sha256'), 'hex');
  END IF;
  
  -- Encrypt using pgcrypto's symmetric encryption
  encrypted_bytes := pgp_sym_encrypt(raw_token, encryption_key);
  
  -- Return as base64 string for storage
  RETURN encode(encrypted_bytes, 'base64');
END;
$$;

-- Drop and recreate the decrypt function using pgcrypto
DROP FUNCTION IF EXISTS public.decrypt_platform_token(text);

CREATE OR REPLACE FUNCTION public.decrypt_platform_token(encrypted_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key text;
  decrypted_text text;
BEGIN
  IF encrypted_token IS NULL OR encrypted_token = '' THEN
    RETURN NULL;
  END IF;
  
  -- Use the same encryption key
  encryption_key := current_setting('app.settings.encryption_key', true);
  
  -- Fallback to a derived key if not set
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := encode(digest('platform_tokens_secret_key_2024', 'sha256'), 'hex');
  END IF;
  
  -- Decrypt using pgcrypto
  decrypted_text := pgp_sym_decrypt(decode(encrypted_token, 'base64'), encryption_key);
  
  RETURN decrypted_text;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.encrypt_platform_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_platform_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_platform_token(text) TO service_role;