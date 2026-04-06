import { useState } from 'react';
import { Instagram, Facebook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IGMetricsDashboard } from '@/components/client-portal/instagram/IGMetricsDashboard';
import { FBMetricsDashboard } from './FBMetricsDashboard';

interface SocialMetricsProps {
  clientId: string;
}

export function SocialMetrics({ clientId }: SocialMetricsProps) {
  const [platform, setPlatform] = useState<'instagram' | 'facebook'>('instagram');

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          variant={platform === 'instagram' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPlatform('instagram')}
          className={platform === 'instagram' ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600' : ''}
        >
          <Instagram className="w-4 h-4 mr-1.5" />
          Instagram
        </Button>
        <Button
          variant={platform === 'facebook' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPlatform('facebook')}
          className={platform === 'facebook' ? 'bg-[#1877F2] hover:bg-[#1565C0]' : ''}
        >
          <Facebook className="w-4 h-4 mr-1.5" />
          Facebook
        </Button>
      </div>

      {platform === 'instagram' ? (
        <IGMetricsDashboard clientId={clientId} />
      ) : (
        <FBMetricsDashboard clientId={clientId} />
      )}
    </div>
  );
}
