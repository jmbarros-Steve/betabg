import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const JARGON: Record<string, string> = {
  ROAS: 'Retorno sobre inversión publicitaria',
  CTR: 'Tasa de clics',
  CPC: 'Costo por clic',
  CPM: 'Costo por mil impresiones',
  CBO: 'Optimización de presupuesto a nivel campaña',
  ABO: 'Optimización de presupuesto a nivel conjunto',
  CPA: 'Costo por adquisición',
  CPL: 'Costo por lead',
  DCT: 'Prueba de Combinación Dinámica',
};

interface JargonTooltipProps {
  term: keyof typeof JARGON | string;
  /** Override the displayed label (e.g. "CPC Prom.") */
  label?: string;
  className?: string;
}

export function JargonTooltip({ term, label, className }: JargonTooltipProps) {
  const explanation = JARGON[term];
  if (!explanation) return <span className={className}>{label ?? term}</span>;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`underline decoration-dotted cursor-help ${className ?? ''}`}>
            {label ?? term}
          </span>
        </TooltipTrigger>
        <TooltipContent>{explanation}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default JargonTooltip;
