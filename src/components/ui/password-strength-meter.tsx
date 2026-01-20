import { getPasswordStrength } from '@/lib/password-validation';

interface PasswordStrengthMeterProps {
  password: string;
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  if (!password) return null;
  
  const { score, label, color } = getPasswordStrength(password);
  
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= score ? color : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Fortaleza: {label}
      </p>
    </div>
  );
}
