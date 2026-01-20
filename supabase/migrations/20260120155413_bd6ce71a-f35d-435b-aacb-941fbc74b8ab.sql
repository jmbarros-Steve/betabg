-- Enable pgsodium extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Create an encryption key for platform tokens
SELECT pgsodium.create_key(
  name := 'platform_tokens_key',
  key_type := 'aead-det'
);

-- Create function to encrypt a token
CREATE OR REPLACE FUNCTION public.encrypt_platform_token(raw_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    ''::bytea,  -- additional data
    key_id
  );
  
  -- Return as base64 string for storage
  RETURN encode(encrypted, 'base64');
END;
$$;

-- Create function to decrypt a token
CREATE OR REPLACE FUNCTION public.decrypt_platform_token(encrypted_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key_id UUID;
  decrypted BYTEA;
BEGIN
  IF encrypted_token IS NULL OR encrypted_token = '' THEN
    RETURN NULL;
  END IF;
  
  -- Get the encryption key
  SELECT id INTO key_id FROM pgsodium.valid_key WHERE name = 'platform_tokens_key' LIMIT 1;
  
  IF key_id IS NULL THEN
    RAISE EXCEPTION 'Encryption key not found';
  END IF;
  
  -- Decrypt the token
  decrypted := pgsodium.crypto_aead_det_decrypt(
    decode(encrypted_token, 'base64'),
    ''::bytea,  -- additional data  
    key_id
  );
  
  RETURN convert_from(decrypted, 'UTF8');
END;
$$;

-- Add encrypted columns to platform_connections
ALTER TABLE public.platform_connections 
ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT,
ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT,
ADD COLUMN IF NOT EXISTS api_key_encrypted TEXT;

-- Migrate existing tokens to encrypted columns
UPDATE public.platform_connections 
SET 
  access_token_encrypted = public.encrypt_platform_token(access_token),
  refresh_token_encrypted = public.encrypt_platform_token(refresh_token),
  api_key_encrypted = public.encrypt_platform_token(api_key)
WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL OR api_key IS NOT NULL;

-- After migration, clear the plaintext columns (keeping for rollback ability)
-- In production, you would drop these columns after verification:
-- ALTER TABLE public.platform_connections DROP COLUMN access_token;
-- ALTER TABLE public.platform_connections DROP COLUMN refresh_token;
-- ALTER TABLE public.platform_connections DROP COLUMN api_key;

-- For now, we'll nullify them to prevent exposure
UPDATE public.platform_connections 
SET 
  access_token = NULL,
  refresh_token = NULL,
  api_key = NULL
WHERE access_token_encrypted IS NOT NULL 
   OR refresh_token_encrypted IS NOT NULL 
   OR api_key_encrypted IS NOT NULL;

-- Grant execute on encryption functions to authenticated users (through edge functions)
GRANT EXECUTE ON FUNCTION public.encrypt_platform_token(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_platform_token(TEXT) TO service_role;

-- Revoke from anon and authenticated to ensure only service_role can use these
REVOKE EXECUTE ON FUNCTION public.encrypt_platform_token(TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_platform_token(TEXT) FROM anon, authenticated;