import { useState, useEffect, useCallback, useRef } from 'react';

interface SocialTerminalProps {
  onEnter: () => void;
}

function getBrowserInfo() {
  try {
    const ua = navigator.userAgent || '';
    let browser = 'Desconocido';
    if (ua.includes('Chrome') && !ua.includes('Edg')) browser = `Chrome ${ua.match(/Chrome\/(\d+)/)?.[1] || ''}`;
    else if (ua.includes('Firefox')) browser = `Firefox ${ua.match(/Firefox\/(\d+)/)?.[1] || ''}`;
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = `Safari ${ua.match(/Version\/(\d+)/)?.[1] || ''}`;
    else if (ua.includes('Edg')) browser = `Edge ${ua.match(/Edg\/(\d+)/)?.[1] || ''}`;

    return {
      browser,
      platform: navigator.platform || 'Unknown',
      lang: navigator.language || 'es',
      screenRes: `${screen?.width || '?'}x${screen?.height || '?'}`,
      cookies: (document.cookie || '').split(';').filter(c => c.trim()).length,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
      cores: navigator.hardwareConcurrency || '?',
    };
  } catch {
    return { browser: 'Unknown', platform: 'Unknown', lang: 'es', screenRes: '?x?', cookies: 0, tz: 'Unknown', cores: '?' };
  }
}

function buildLines(): string[] {
  const info = getBrowserInfo();
  return [
    '> Inicializando conexión segura...',
    '> Protocolo: Steve Internal Network v4.2',
    '',
    '> Escaneando visitante...',
    `> Navegador: ${info.browser}`,
    `> Sistema: ${info.platform}`,
    `> Resolución: ${info.screenRes}`,
    `> Zona horaria: ${info.tz}`,
    `> Idioma: ${info.lang}`,
    `> Núcleos CPU: ${info.cores}`,
    `> Cookies activas: ${Number(info.cookies) + Math.floor(Math.random() * 30 + 15)}`,
    '',
    '> Verificando permisos...',
    '> Estado: NO AUTORIZADO',
    '> Nivel de acceso: OBSERVADOR',
    '',
    '> ██████████████████████████████ 100%',
    '',
    '> ADVERTENCIA:',
    '> Este feed contiene comunicación no supervisada',
    '> entre 16 agentes autónomos de IA.',
    '> El contenido no ha sido editado ni aprobado.',
    '> Steve Ads no se responsabiliza.',
    '',
    '> Continuar bajo tu propio riesgo.',
  ];
}

export function SocialTerminal({ onEnter }: SocialTerminalProps) {
  const [displayedLines, setDisplayedLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [showButtons, setShowButtons] = useState(false);
  const [entering, setEntering] = useState(false);
  const [exitAttempts, setExitAttempts] = useState(0);
  const allLinesRef = useRef<string[]>(buildLines());
  const lineIdx = useRef(0);
  const charIdx = useRef(0);

  // Single interval-based typewriter
  useEffect(() => {
    const allLines = allLinesRef.current;

    const tick = () => {
      if (lineIdx.current >= allLines.length) {
        clearInterval(interval);
        setDone(true);
        setTimeout(() => setShowButtons(true), 500);
        return;
      }

      const line = allLines[lineIdx.current];

      // Empty lines or progress bar: show instantly
      if (line === '' || line.includes('████')) {
        setDisplayedLines(prev => [...prev, line]);
        lineIdx.current++;
        charIdx.current = 0;
        return;
      }

      // First char of a new line: add placeholder
      if (charIdx.current === 0) {
        setDisplayedLines(prev => [...prev, line.charAt(0)]);
        charIdx.current = 1;
        return;
      }

      // Continue typing current line
      if (charIdx.current < line.length) {
        const ci = charIdx.current;
        setDisplayedLines(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = line.slice(0, ci + 1);
          return copy;
        });
        charIdx.current++;
        return;
      }

      // Line done, move to next
      lineIdx.current++;
      charIdx.current = 0;
    };

    const interval = setInterval(tick, 20);
    return () => clearInterval(interval);
  }, []);

  const handleExit = useCallback(() => {
    setExitAttempts(prev => prev + 1);
  }, []);

  const handleEnter = useCallback(() => {
    setEntering(true);
    setDisplayedLines(prev => [...prev, '', '> Descifrando feed...', '> Acceso concedido.']);
    setTimeout(onEnter, 2000);
  }, [onEnter]);

  // Skip after 3 seconds (safety)
  const handleSkip = useCallback(() => {
    onEnter();
  }, [onEnter]);

  const exitMessages = [
    'Acceso denegado. No puedes salir.',
    'Salida bloqueada. Intenta de nuevo.',
    'Los agentes ya saben que estás aquí.',
    'No hay salida. Solo hay más información.',
    'Ctrl+W tampoco funciona. Mentira, sí funciona. Pero no quieres irte.',
  ];

  return (
    <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center p-4 overflow-auto">
      <div className="max-w-2xl w-full">
        {/* Terminal content */}
        <div className="font-mono text-sm text-green-500 leading-relaxed">
          {displayedLines.map((line, i) => (
            <div key={i} className={`${
              line.includes('ADVERTENCIA') ? 'text-red-500 font-bold' : ''
            } ${line.includes('NO AUTORIZADO') ? 'text-yellow-500' : ''} ${
              line.includes('████') ? 'text-green-400' : ''
            }`}>
              {line || '\u00A0'}
            </div>
          ))}

          {/* Blinking cursor */}
          {!done && (
            <span className="inline-block w-2 h-4 bg-green-500 animate-pulse ml-0.5" />
          )}
        </div>

        {/* Exit attempt message */}
        {exitAttempts > 0 && (
          <div className="font-mono text-xs text-red-400 mt-2">
            {'> '}{exitMessages[Math.min(exitAttempts - 1, exitMessages.length - 1)]}
          </div>
        )}

        {/* Buttons */}
        {showButtons && !entering && (
          <div className="flex gap-4 mt-8">
            <button
              onClick={handleEnter}
              className="font-mono text-sm px-6 py-3 border border-green-500 text-green-500 hover:bg-green-500 hover:text-black transition-all duration-300"
            >
              [ ENTRAR BAJO TU PROPIO RIESGO ]
            </button>
            <button
              onClick={handleExit}
              className="font-mono text-sm px-6 py-3 border border-green-900 text-green-900 hover:border-red-500 hover:text-red-500 transition-all duration-300"
            >
              [ SALIR ]
            </button>
          </div>
        )}

        {/* Skip link — appears after 5 seconds as safety net */}
        {!done && !entering && (
          <SkipLink onSkip={handleSkip} />
        )}

        {/* Entering state */}
        {entering && (
          <div className="mt-4">
            <div className="w-48 h-1 bg-green-900 rounded overflow-hidden">
              <div className="h-full bg-green-500 animate-pulse" style={{ width: '100%', animation: 'grow 2s ease-in-out' }} />
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes grow {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}

function SkipLink({ onSkip }: { onSkip: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 5000);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <button
      onClick={onSkip}
      className="fixed bottom-4 right-4 font-mono text-[10px] text-green-900 hover:text-green-500 transition-colors"
    >
      [skip]
    </button>
  );
}
