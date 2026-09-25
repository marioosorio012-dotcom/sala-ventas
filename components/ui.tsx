'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// ---------- Modal base ----------
export function Modal({
  titulo,
  onClose,
  children,
  acciones,
  ancho,
}: {
  titulo: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  acciones: ReactNode;
  ancho?: 'normal' | 'wide';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // solo cierra el modal que está encima
      const todos = document.querySelectorAll('.modal-backdrop');
      if (todos[todos.length - 1] === ref.current) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={'modal' + (ancho === 'wide' ? ' modal-wide' : '')} role="dialog" aria-modal="true">
        <h3>{titulo}</h3>
        {children}
        <div className="modal-actions">{acciones}</div>
      </div>
    </div>
  );
}

export function Campo({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: ReactNode }) {
  return (
    <div className="field">
      <label>
        {etiqueta}
        {children}
      </label>
      {ayuda && <div className="field-hint">{ayuda}</div>}
    </div>
  );
}

// ---------- Toasts y confirmaciones (contexto global) ----------
type OpcionesConfirmar = { mensaje: string; etiqueta?: string; peligro?: boolean };

type Ctx = {
  toast: (msg: string) => void;
  confirmar: (o: OpcionesConfirmar) => Promise<boolean>;
};

const UICtx = createContext<Ctx | null>(null);

export function useUI() {
  const c = useContext(UICtx);
  if (!c) throw new Error('useUI fuera de UIProvider');
  return c;
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [conf, setConf] = useState<(OpcionesConfirmar & { resolver: (v: boolean) => void }) | null>(null);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMsg(null), 2800);
  }, []);

  const confirmar = useCallback(
    (o: OpcionesConfirmar) => new Promise<boolean>((resolver) => setConf({ ...o, resolver })),
    [],
  );

  const cerrar = (v: boolean) => {
    conf?.resolver(v);
    setConf(null);
  };

  const peligro = conf ? conf.peligro ?? (!conf.etiqueta || conf.etiqueta === 'Eliminar') : false;

  return (
    <UICtx.Provider value={{ toast, confirmar }}>
      {children}
      {conf && (
        <Modal
          titulo="Confirmar"
          onClose={() => cerrar(false)}
          acciones={
            <>
              <button className="btn" onClick={() => cerrar(false)}>
                Cancelar
              </button>
              <button className={'btn ' + (peligro ? 'btn-danger' : 'btn-primary')} onClick={() => cerrar(true)} autoFocus>
                {conf.etiqueta || 'Eliminar'}
              </button>
            </>
          }
        >
          <p style={{ fontSize: '0.9rem', margin: '0 0 4px' }}>{conf.mensaje}</p>
        </Modal>
      )}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </UICtx.Provider>
  );
}
