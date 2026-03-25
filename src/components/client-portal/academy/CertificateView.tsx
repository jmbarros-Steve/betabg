import { useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Award, Share2 } from 'lucide-react';
import { toast } from 'sonner';

interface CertificateViewProps {
  certificate: {
    id: string;
    certificate_number: string;
    issued_at: string;
  };
  courseName: string;
  userName: string;
}

export function CertificateView({ certificate, courseName, userName }: CertificateViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const issuedDate = new Date(certificate.issued_at).toLocaleDateString('es-CL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const generatePDF = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Border
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 8;
    ctx.strokeRect(30, 30, w - 60, h - 60);

    // Inner border
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 2;
    ctx.strokeRect(45, 45, w - 90, h - 90);

    // Corner decorations
    const cornerSize = 30;
    ctx.fillStyle = '#c9a84c';
    [[55, 55], [w - 55 - cornerSize, 55], [55, h - 55 - cornerSize], [w - 55 - cornerSize, h - 55 - cornerSize]].forEach(([x, y]) => {
      ctx.fillRect(x, y, cornerSize, cornerSize);
    });

    // Header
    ctx.fillStyle = '#1e3a5f';
    ctx.font = 'bold 18px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('STEVE ACADEMY', w / 2, 120);

    // Certificate title
    ctx.fillStyle = '#333';
    ctx.font = '14px Georgia, serif';
    ctx.fillText('CERTIFICADO DE COMPLETACIÓN', w / 2, 160);

    // Divider line
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(200, 180);
    ctx.lineTo(w - 200, 180);
    ctx.stroke();

    // "Otorgado a"
    ctx.fillStyle = '#666';
    ctx.font = '13px Georgia, serif';
    ctx.fillText('Se otorga el presente certificado a', w / 2, 220);

    // Name
    ctx.fillStyle = '#1e3a5f';
    ctx.font = 'bold 28px Georgia, serif';
    ctx.fillText(userName, w / 2, 265);

    // Line under name
    ctx.strokeStyle = '#ddd';
    ctx.beginPath();
    ctx.moveTo(250, 280);
    ctx.lineTo(w - 250, 280);
    ctx.stroke();

    // "por completar"
    ctx.fillStyle = '#666';
    ctx.font = '13px Georgia, serif';
    ctx.fillText('por haber completado exitosamente el curso', w / 2, 315);

    // Course name
    ctx.fillStyle = '#333';
    ctx.font = 'bold 20px Georgia, serif';
    ctx.fillText(courseName, w / 2, 350);

    // Date
    ctx.fillStyle = '#666';
    ctx.font = '12px Georgia, serif';
    ctx.fillText(`Fecha de emisión: ${issuedDate}`, w / 2, 400);

    // Certificate number
    ctx.font = '10px monospace';
    ctx.fillStyle = '#999';
    ctx.fillText(`N° ${certificate.certificate_number}`, w / 2, 430);

    // Download
    const link = document.createElement('a');
    link.download = `certificado-${certificate.certificate_number}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    toast.success('Certificado descargado');
  };

  return (
    <div className="space-y-6">
      {/* Visual preview */}
      <Card className="overflow-hidden border-2 border-amber-200">
        <CardContent className="p-8 bg-gradient-to-br from-white to-amber-50/30">
          <div className="text-center space-y-6 py-8">
            <Award className="w-16 h-16 text-amber-500 mx-auto" />

            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Steve Academy</p>
              <h2 className="text-2xl font-bold text-slate-800">Certificado de Completacion</h2>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Se otorga el presente certificado a</p>
              <p className="text-3xl font-bold text-primary">{userName}</p>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">por haber completado exitosamente el curso</p>
              <p className="text-xl font-semibold text-slate-700">{courseName}</p>
            </div>

            <div className="pt-4 space-y-1">
              <p className="text-sm text-muted-foreground">{issuedDate}</p>
              <p className="text-xs text-muted-foreground font-mono">N° {certificate.certificate_number}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3 justify-center">
        <Button onClick={generatePDF}>
          <Download className="w-4 h-4 mr-2" />
          Descargar PDF
        </Button>
      </div>

      {/* Hidden canvas for PDF generation */}
      <canvas ref={canvasRef} width={800} height={500} className="hidden" />
    </div>
  );
}
