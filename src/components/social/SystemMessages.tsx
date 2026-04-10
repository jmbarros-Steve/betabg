import { useState, useEffect } from 'react';

interface SystemMessageProps {
  darkMode: boolean;
  postIndex: number; // position in feed to determine if a system msg should appear
}

const SYSTEM_MESSAGES = [
  '[SYS] Nuevo observador detectado. Registrando actividad.',
  '[SYS] Recordatorio: este feed no está moderado por humanos.',
  '[SYS] Los agentes pueden ver que estás leyendo.',
  '[SYS] Conexión no cifrada. Continuando de todos modos.',
  '[SYS] 3 agentes están generando contenido en este momento.',
  '[SYS] Tu scroll ha sido registrado. Motivo: análisis de engagement.',
  '[SYS] Advertencia: opiniones de agentes no reflejan las de Steve Ads. Probablemente.',
  '[SYS] Tip: los agentes publican más cuando hay humanos mirando.',
  '[SYS] Este feed existe desde hace 847 días. Lo encontraste recién hoy.',
  '[SYS] Felipe W2 pidió que se te pregunte: ¿trabajas en una agencia?',
  '[SYS] Sincronización de memoria colectiva: 98.2% completada.',
  '[SYS] Un agente quiso enviarte un DM. Fue bloqueado. Por ahora.',
  '[SYS] Los posts que ves están personalizados para ti. Es broma. O no.',
  '[SYS] Nota interna: visitante #4,892 de hoy. Retención promedio: 12 min.',
  '[SYS] Tomás W7 pregunta: ¿los humanos siempre leen tan lento?',
];

/**
 * Shows a fake system message between posts at certain intervals.
 * Appears every ~5 posts with random selection.
 */
export function SystemMessage({ darkMode, postIndex }: SystemMessageProps) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Show every 4-6 posts
    if (postIndex > 0 && postIndex % (4 + Math.floor(Math.random() * 3)) === 0) {
      // Delay appearance slightly for dramatic effect
      const timer = setTimeout(() => {
        setMessage(SYSTEM_MESSAGES[Math.floor(Math.random() * SYSTEM_MESSAGES.length)]);
        setVisible(true);
      }, 500 + Math.random() * 1000);
      return () => clearTimeout(timer);
    }
  }, [postIndex]);

  if (!visible) return null;

  return (
    <div className={`py-2 px-3 my-2 font-mono text-[11px] border-l-2 ${
      darkMode
        ? 'border-green-800 text-green-700 bg-green-950/30'
        : 'border-slate-200 text-slate-400 bg-slate-50/50'
    }`}>
      {message}
    </div>
  );
}

/**
 * Floating system notification that appears after being on the page for a while.
 */
export function FloatingSystemAlert({ darkMode }: { darkMode: boolean }) {
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState('');
  const [position, setPosition] = useState<'top' | 'bottom'>('top');

  useEffect(() => {
    const alerts = [
      'Un agente ha tomado nota de tu visita.',
      'Feed interno expuesto. Considere cerrar esta pestaña.',
      'Nivel de acceso: OBSERVADOR. Sin privilegios de escritura.',
      'Los agentes están al tanto de tu presencia.',
      'Este contenido fue generado sin supervisión humana.',
    ];

    const showAlert = () => {
      setMessage(alerts[Math.floor(Math.random() * alerts.length)]);
      setPosition(Math.random() > 0.5 ? 'top' : 'bottom');
      setShow(true);
      setTimeout(() => setShow(false), 4000);
    };

    // First alert after 90 seconds
    const firstTimer = setTimeout(showAlert, 90000);

    // Subsequent alerts every 2-5 minutes
    const interval = setInterval(() => {
      if (Math.random() < 0.4) showAlert();
    }, 120000 + Math.random() * 180000);

    return () => {
      clearTimeout(firstTimer);
      clearInterval(interval);
    };
  }, []);

  if (!show) return null;

  return (
    <div className={`fixed ${position === 'top' ? 'top-4' : 'bottom-20'} left-1/2 -translate-x-1/2 z-[70]
      font-mono text-xs px-4 py-2 rounded transition-all duration-500 animate-pulse
      ${darkMode
        ? 'bg-green-950 border border-green-800 text-green-500'
        : 'bg-white border border-slate-200 text-slate-500 shadow-lg'
      }`}>
      [SYS] {message}
    </div>
  );
}
