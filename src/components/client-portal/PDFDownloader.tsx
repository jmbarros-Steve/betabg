import { useState } from 'react';
import { jsPDF } from 'jspdf';
import { Button } from '@/components/ui/button';
import { Download, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.jpg';

interface PDFDownloaderProps {
  type: 'meta_copy' | 'google_copy' | 'klaviyo_email';
  title: string;
  content: PDFContent;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'icon';
}

interface MetaCopyContent {
  funnelStage: string;
  adType: string;
  headlines: string[];
  primaryText: string;
  description?: string;
  hooks?: string[];
  script?: string;
}

interface GoogleCopyContent {
  campaignType: string;
  headlines: string[];
  longHeadlines?: string[];
  descriptions: string[];
  sitelinks?: Array<{ title: string; description: string; suggestedUrl: string }>;
}

interface KlaviyoEmailContent {
  planName: string;
  flowType: string;
  emails: Array<{
    subject: string;
    previewText?: string;
    content: string;
    delayDays: number;
    delayHours: number;
  }>;
}

type PDFContent = MetaCopyContent | GoogleCopyContent | KlaviyoEmailContent;

// Convert image to base64 for embedding in PDF
async function loadImageAsBase64(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg'));
    };
    img.onerror = reject;
    img.src = src;
  });
}

export function PDFDownloader({ type, title, content, variant = 'outline', size = 'sm' }: PDFDownloaderProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function generatePDF() {
    setIsGenerating(true);

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - (margin * 2);
      let yPosition = margin;

      // Load and add logo
      try {
        const logoBase64 = await loadImageAsBase64(logo);
        doc.addImage(logoBase64, 'JPEG', margin, yPosition, 40, 15);
        yPosition += 25;
      } catch (e) {
        console.warn('Could not load logo:', e);
        yPosition += 10;
      }

      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(title, margin, yPosition);
      yPosition += 10;

      // Date
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(128, 128, 128);
      doc.text(`Generado: ${new Date().toLocaleDateString('es-ES', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })}`, margin, yPosition);
      yPosition += 10;

      doc.setTextColor(0, 0, 0);

      // Horizontal line
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 10;

      // Helper function to add text with word wrap and page break handling
      const addWrappedText = (text: string, fontSize: number = 11, isBold: boolean = false) => {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        const lines = doc.splitTextToSize(text, contentWidth);
        
        for (const line of lines) {
          if (yPosition > pageHeight - margin - 10) {
            doc.addPage();
            yPosition = margin;
          }
          doc.text(line, margin, yPosition);
          yPosition += fontSize * 0.4;
        }
        yPosition += 3;
      };

      const addSection = (sectionTitle: string) => {
        if (yPosition > pageHeight - margin - 20) {
          doc.addPage();
          yPosition = margin;
        }
        yPosition += 5;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(79, 70, 229); // Primary color
        doc.text(sectionTitle, margin, yPosition);
        doc.setTextColor(0, 0, 0);
        yPosition += 8;
      };

      // Generate content based on type
      if (type === 'meta_copy') {
        const c = content as MetaCopyContent;
        
        addSection(`Meta Ads - ${c.funnelStage.toUpperCase()} (${c.adType === 'static' ? 'Estático' : 'Video'})`);
        
        addSection('Headlines');
        c.headlines.forEach((headline, i) => {
          addWrappedText(`${i + 1}. ${headline}`);
        });

        addSection('Texto Principal');
        addWrappedText(c.primaryText);

        if (c.description) {
          addSection('Descripción');
          addWrappedText(c.description);
        }

        if (c.hooks && c.hooks.length > 0) {
          addSection('Video Hooks (3 segundos)');
          c.hooks.forEach((hook, i) => {
            addWrappedText(`${i + 1}. ${hook}`);
          });
        }

        if (c.script) {
          addSection('Guión de Video');
          addWrappedText(c.script);
        }
      } else if (type === 'google_copy') {
        const c = content as GoogleCopyContent;
        
        addSection(`Google Ads - ${c.campaignType}`);

        addSection('Headlines (30 caracteres)');
        c.headlines.forEach((headline, i) => {
          addWrappedText(`${i + 1}. ${headline} (${headline.length}/30)`);
        });

        if (c.longHeadlines && c.longHeadlines.length > 0) {
          addSection('Títulos Largos (90 caracteres)');
          c.longHeadlines.forEach((headline, i) => {
            addWrappedText(`${i + 1}. ${headline} (${headline.length}/90)`);
          });
        }

        addSection('Descripciones (90 caracteres)');
        c.descriptions.forEach((desc, i) => {
          addWrappedText(`${i + 1}. ${desc} (${desc.length}/90)`);
        });

        if (c.sitelinks && c.sitelinks.length > 0) {
          addSection('Sitelinks');
          c.sitelinks.forEach((sitelink, i) => {
            addWrappedText(`${i + 1}. ${sitelink.title}`, 11, true);
            addWrappedText(`   ${sitelink.description}`);
            addWrappedText(`   URL: ${sitelink.suggestedUrl}`);
            yPosition += 3;
          });
        }
      } else if (type === 'klaviyo_email') {
        const c = content as KlaviyoEmailContent;
        
        addSection(`Klaviyo - ${c.planName} (${c.flowType})`);

        c.emails.forEach((email, i) => {
          if (yPosition > pageHeight - margin - 40) {
            doc.addPage();
            yPosition = margin;
          }

          addSection(`Email ${i + 1}: ${email.subject}`);
          
          if (email.delayDays > 0 || email.delayHours > 0) {
            const delay = [];
            if (email.delayDays > 0) delay.push(`${email.delayDays} día${email.delayDays > 1 ? 's' : ''}`);
            if (email.delayHours > 0) delay.push(`${email.delayHours} hora${email.delayHours > 1 ? 's' : ''}`);
            addWrappedText(`Delay: ${delay.join(' y ')}`);
          }

          if (email.previewText) {
            addWrappedText(`Preview: ${email.previewText}`);
          }

          if (email.content) {
            yPosition += 3;
            addWrappedText(email.content);
          }

          yPosition += 5;
        });
      }

      // Footer on each page
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(
          `BG Consult | Página ${i} de ${pageCount}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        );
      }

      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
      const filename = `BG_Consult_${type}_${sanitizedTitle}_${timestamp}.pdf`;

      doc.save(filename);
      toast.success('PDF descargado correctamente');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar el PDF');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Button 
      variant={variant} 
      size={size} 
      onClick={generatePDF}
      disabled={isGenerating}
    >
      {isGenerating ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Generando...
        </>
      ) : (
        <>
          <Download className="h-4 w-4 mr-2" />
          Descargar PDF
        </>
      )}
    </Button>
  );
}
