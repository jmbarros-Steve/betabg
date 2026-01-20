-- Fix: avoid pgcrypto.digest signature issues by using built-in md5 for fallback key
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

  encryption_key := current_setting('app.settings.encryption_key', true);

  -- Fallback key (deterministic) using built-in md5
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := md5('platform_tokens_secret_key_2024');
  END IF;

  encrypted_bytes := pgp_sym_encrypt(raw_token, encryption_key);
  RETURN encode(encrypted_bytes, 'base64');
END;
$$;

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

  encryption_key := current_setting('app.settings.encryption_key', true);

  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := md5('platform_tokens_secret_key_2024');
  END IF;

  decrypted_text := pgp_sym_decrypt(decode(encrypted_token, 'base64'), encryption_key);
  RETURN decrypted_text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.encrypt_platform_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_platform_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_platform_token(text) TO service_role;