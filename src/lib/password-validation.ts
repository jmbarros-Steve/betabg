import { z } from 'zod';

// Common passwords list (top weak passwords to reject)
const COMMON_PASSWORDS = [
  'password', '123456', '12345678', 'qwerty', 'abc123',
  '111111', 'password1', 'admin', 'letmein', 'welcome',
  'monkey', 'dragon', 'master', 'login', 'passw0rd',
  '123456789', '1234567890', 'iloveyou', 'sunshine', 'princess',
  'football', 'baseball', 'soccer', 'hockey', 'batman',
  'trustno1', 'shadow', 'superman', 'michael', 'jennifer',
];

/**
 * Strong password schema with complexity requirements
 */
export const passwordSchema = z.string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(100, 'La contraseña es demasiado larga')
  .refine(
    (password) => /[a-z]/.test(password),
    'Debe contener al menos una letra minúscula'
  )
  .refine(
    (password) => /[A-Z]/.test(password),
    'Debe contener al menos una letra mayúscula'
  )
  .refine(
    (password) => /[0-9]/.test(password),
    'Debe contener al menos un número'
  )
  .refine(
    (password) => /[^a-zA-Z0-9]/.test(password),
    'Debe contener al menos un carácter especial (!@#$%^&*)'
  )
  .refine(
    (password) => !COMMON_PASSWORDS.includes(password.toLowerCase()),
    'Esta contraseña es demasiado común. Elige una más segura'
  )
  .refine(
    (password) => !/(.)(\1{2,})/.test(password),
    'La contraseña no puede tener más de 2 caracteres iguales consecutivos'
  );

/**
 * Calculate password strength score (0-4)
 */
export function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;
  
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  
  // Cap at 4
  score = Math.min(score, 4);
  
  const labels = ['Muy débil', 'Débil', 'Regular', 'Buena', 'Fuerte'];
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-500'];
  
  return {
    score,
    label: labels[score],
    color: colors[score],
  };
}
