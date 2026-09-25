'use client';
import { useState } from 'react';
import { Campo, Modal, useUI } from './ui';
import {
  formatoFecha, formatoPesos, generarPlan,
  type Compromiso, type CuotaPlan, type InfoPropietario, type Lote,
} from '@/lib/logic';

/** Ejecuta una acción async mostrando estado "guardando" y cerrando si sale bien. */
function useGuardar(onClose: () => void) {
  const { toast } = useUI();
  const [ocupado, setOcupado] = useState(false);
  const ejecutar = async (fn: () => Promise<void>, msgOk?: string) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      await fn();
      if (msgOk) toast(msgOk);
      onClose();
    } catch (e) {
      toast((e as Error).message || 'Ocurrió un error');
      setOcupado(false);
    }
  };
  return { ocupado, ejecutar };
}

const num = (s: string) => (s.trim() === '' ? null : Number(s));

// ---------------- Lote (crear / renombrar) ----------------
export function LoteModal({
  existente,
  onClose,
  onGuardar,
}: {
  existente: Lote | null;
  onClose: () => void;
  onGuardar: (numero: string) => Promise<void>;
}) {
  const [numero, setNumero] = useState(existente?.numero_lote ?? '');
  const { ocupado, ejecutar } = useGuardar(onClose);
  const guardar = () => {
    if (!numero.trim()) return;
    ejecutar(() => onGuardar(numero.trim()), existente ? 'Lote actualizado' : 'Lote creado');
  };
  return (
    <Modal
      titulo={existente ? 'Editar lote' : 'Nuevo lote'}
      onClose={onClose}
      acciones={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={ocupado || !numero.trim()}>
            {existente ? 'Guardar' : 'Crear'}
          </button>
        </>
      }
    >
      <Campo etiqueta="Número de lote">
        <input
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && guardar()}
          placeholder="Ej. 12"
          autoFocus
        />
      </Campo>
    </Modal>
  );
}

// ---------------- Información del propietario ----------------
export function InfoModal({
  existente,
  onClose,
  onGuardar,
}: {
  existente: InfoPropietario | null;
  onClose: () => void;
  onGuardar: (d: { nombre_propietario: string; valor_venta: number | null; fecha_venta: string | null }) => Promise<void>;
}) {
  const [nombre, setNombre] = useState(existente?.nombre_propietario ?? '');
  const [valor, setValor] = useState(existente?.valor_venta != null ? String(existente.valor_venta) : '');
  const [fecha, setFecha] = useState(existente?.fecha_venta ?? '');
  const { ocupado, ejecutar } = useGuardar(onClose);
  const guardar = () => {
    if (!nombre.trim()) return;
    ejecutar(
      () => onGuardar({ nombre_propietario: nombre.trim(), valor_venta: num(valor), fecha_venta: fecha || null }),
      'Información guardada',
    );
  };
  return (
    <Modal
      titulo={existente ? 'Editar información' : 'Información del propietario'}
      onClose={onClose}
      acciones={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={ocupado || !nombre.trim()}>Guardar</button>
        </>
      }
    >
      <Campo etiqueta="Nombre propietario">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </Campo>
      <Campo etiqueta="Valor de venta" ayuda={valor ? formatoPesos(valor) : undefined}>
        <input type="number" inputMode="decimal" step="any" min="0" value={valor} onChange={(e) => setValor(e.target.value)} />
      </Campo>
      <Campo etiqueta="Fecha de venta">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Campo>
    </Modal>
  );
}

// ---------------- Nuevo compromiso (solo fecha y valor programados) ----------------
export function NuevoCompromisoModal({
  onClose,
  onGuardar,
}: {
  onClose: () => void;
  onGuardar: (d: { fecha_programada: string; valor_programado: number }) => Promise<void>;
}) {
  const [fecha, setFecha] = useState('');
  const [valor, setValor] = useState('');
  const { ocupado, ejecutar } = useGuardar(onClose);
  const valido = !!fecha && valor.trim() !== '';
  return (
    <Modal
      titulo="Nuevo compromiso de pago"
      onClose={onClose}
      acciones={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            disabled={ocupado || !valido}
            onClick={() => ejecutar(() => onGuardar({ fecha_programada: fecha, valor_programado: Number(valor) }), 'Compromiso agregado')}
          >
            Guardar
          </button>
        </>
      }
    >
      <Campo etiqueta="Fecha programada">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} autoFocus />
      </Campo>
      <Campo etiqueta="Valor programado" ayuda={valor ? formatoPesos(valor) : undefined}>
        <input type="number" inputMode="decimal" step="any" min="0" value={valor} onChange={(e) => setValor(e.target.value)} />
      </Campo>
    </Modal>
  );
}

// ---------------- Editar compromiso (4 campos) ----------------
type DatosCompromiso = {
  fecha_programada: string;
  valor_programado: number;
  fecha_real: string | null;
  valor_real: number | null;
};

export function EditarCompromisoModal({
  existente,
  onClose,
  onGuardar,
}: {
  existente: Compromiso;
  onClose: () => void;
  onGuardar: (d: DatosCompromiso) => Promise<void>;
}) {
  const { confirmar, toast } = useUI();
  const [fecha, setFecha] = useState(existente.fecha_programada);
  const [valor, setValor] = useState(String(existente.valor_programado));
  const [fechaReal, setFechaReal] = useState(existente.fecha_real ?? '');
  const [valorReal, setValorReal] = useState(existente.valor_real != null ? String(existente.valor_real) : '');
  const { ocupado, ejecutar } = useGuardar(onClose);
  const valido = !!fecha && valor.trim() !== '';

  const guardar = () => {
    if (!!fechaReal !== (valorReal.trim() !== '')) {
      toast('Para registrar el pago real llena la fecha real y el valor real');
      return;
    }
    ejecutar(
      () => onGuardar({ fecha_programada: fecha, valor_programado: Number(valor), fecha_real: fechaReal || null, valor_real: num(valorReal) }),
      'Compromiso actualizado',
    );
  };

  const eliminarPagoRealizado = async () => {
    const ok = await confirmar({
      mensaje: 'Esto borrará la fecha y el valor real de pago registrados, dejando el compromiso como pendiente. ¿Continuar?',
      etiqueta: 'Eliminar',
    });
    if (!ok) return;
    ejecutar(
      () => onGuardar({
        fecha_programada: existente.fecha_programada,
        valor_programado: existente.valor_programado,
        fecha_real: null,
        valor_real: null,
      }),
      'Pago realizado eliminado',
    );
  };

  return (
    <Modal
      titulo="Editar compromiso de pago"
      onClose={onClose}
      acciones={
        <>
          {existente.fecha_real && (
            <button className="btn btn-danger-text" style={{ marginRight: 'auto' }} onClick={eliminarPagoRealizado} disabled={ocupado}>
              🗑️ Eliminar pago realizado
            </button>
          )}
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={ocupado || !valido}>Guardar</button>
        </>
      }
    >
      <Campo etiqueta="Fecha programada">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} autoFocus />
      </Campo>
      <Campo etiqueta="Valor programado">
        <input type="number" inputMode="decimal" step="any" min="0" value={valor} onChange={(e) => setValor(e.target.value)} />
      </Campo>
      <Campo etiqueta="Fecha real de pago (opcional)">
        <input type="date" value={fechaReal} onChange={(e) => setFechaReal(e.target.value)} />
      </Campo>
      <Campo etiqueta="Valor real de pago (opcional)">
        <input type="number" inputMode="decimal" step="any" min="0" value={valorReal} onChange={(e) => setValorReal(e.target.value)} />
      </Campo>
    </Modal>
  );
}

// ---------------- Registrar pago ----------------
export function RegistrarPagoModal({
  compromisos,
  onClose,
  onGuardar,
}: {
  compromisos: Compromiso[];
  onClose: () => void;
  onGuardar: (c: Compromiso, fechaReal: string, valorReal: number) => Promise<void>;
}) {
  const pendientes = compromisos.filter((p) => !p.fecha_real);
  const [selId, setSelId] = useState(pendientes[0]?.id ?? '');
  const [fechaReal, setFechaReal] = useState('');
  const [valorReal, setValorReal] = useState(pendientes[0] ? String(pendientes[0].valor_programado) : '');
  const { ocupado, ejecutar } = useGuardar(onClose);

  if (!pendientes.length) {
    return (
      <Modal titulo="Registrar pago realizado" onClose={onClose} acciones={<button className="btn" onClick={onClose}>Cerrar</button>}>
        <div className="empty-state" style={{ padding: '10px 0 4px' }}>No hay compromisos de pago pendientes por registrar.</div>
      </Modal>
    );
  }
  const sel = pendientes.find((p) => p.id === selId);
  const valido = !!sel && !!fechaReal && valorReal.trim() !== '';
  return (
    <Modal
      titulo="Registrar pago realizado"
      onClose={onClose}
      acciones={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            disabled={ocupado || !valido}
            onClick={() => sel && ejecutar(() => onGuardar(sel, fechaReal, Number(valorReal)), 'Pago registrado')}
          >
            Guardar
          </button>
        </>
      }
    >
      <Campo etiqueta="Compromiso de pago">
        <select
          value={selId}
          onChange={(e) => {
            setSelId(e.target.value);
            const p = pendientes.find((x) => x.id === e.target.value);
            if (p) setValorReal(String(p.valor_programado));
          }}
        >
          {pendientes.map((p) => (
            <option key={p.id} value={p.id}>
              {formatoFecha(p.fecha_programada)} — {formatoPesos(p.valor_programado)}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta="Fecha real de pago">
        <input type="date" value={fechaReal} onChange={(e) => setFechaReal(e.target.value)} autoFocus />
      </Campo>
      <Campo etiqueta="Valor real de pago" ayuda={valorReal ? formatoPesos(valorReal) : undefined}>
        <input type="number" inputMode="decimal" step="any" min="0" value={valorReal} onChange={(e) => setValorReal(e.target.value)} />
      </Campo>
    </Modal>
  );
}

// ---------------- Generar plan automático ----------------
const PERIODOS = [
  { v: 1, t: 'Mensual' },
  { v: 2, t: 'Bimensual' },
  { v: 3, t: 'Trimestral' },
  { v: 6, t: 'Semestral' },
  { v: 12, t: 'Anual' },
];

export function GenerarPlanModal({
  info,
  existentes,
  onClose,
  onGuardar,
}: {
  info: InfoPropietario | null;
  existentes: number;
  onClose: () => void;
  onGuardar: (cuotas: CuotaPlan[]) => Promise<void>;
}) {
  const { toast, confirmar } = useUI();
  const [fInicial, setFInicial] = useState('');
  const [vInicial, setVInicial] = useState('');
  const [periodo, setPeriodo] = useState(1);
  const [fFinal, setFFinal] = useState('');
  const [vFinal, setVFinal] = useState('');
  const { ocupado, ejecutar } = useGuardar(onClose);
  const venta = Number(info?.valor_venta) || 0;

  const generar = async () => {
    if (!info || !venta) { toast('Falta el valor de venta del propietario'); return; }
    if (!fInicial || !fFinal) { toast('Completa ambas fechas'); return; }
    if (fFinal <= fInicial) { toast('La fecha final debe ser posterior a la inicial'); return; }
    const vi = Number(vInicial) || 0;
    const vf = Number(vFinal) || 0;
    if (vi + vf > venta) { toast('La cuota inicial más la final superan el valor de venta'); return; }
    const plan = generarPlan(fInicial, vi, periodo, fFinal, vf, venta);
    if (existentes > 0) {
      const ok = await confirmar({
        mensaje: `Esto reemplazará los ${existentes} compromiso(s) de pago existentes en este lote.`,
        etiqueta: 'Reemplazar',
        peligro: true,
      });
      if (!ok) return;
    }
    ejecutar(async () => {
      await onGuardar(plan.cuotas);
      if (plan.restanteSumadoAFinal) {
        toast('No caben cuotas intermedias con esa periodicidad; el restante se sumó a la cuota final');
      }
    }, plan.restanteSumadoAFinal ? undefined : `Plan de pagos generado (${plan.cuotas.length} cuotas)`);
  };

  return (
    <Modal
      titulo="Generar plan de pagos"
      onClose={onClose}
      acciones={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={generar} disabled={ocupado || !info}>Generar</button>
        </>
      }
    >
      {info && venta ? (
        <div className="field-hint" style={{ marginBottom: 12 }}>Valor de venta: {formatoPesos(venta)}</div>
      ) : (
        <div className="field-hint" style={{ marginBottom: 12, color: 'var(--danger)' }}>
          Ingresa primero el &quot;Valor de venta&quot; en la información del propietario.
        </div>
      )}
      <Campo etiqueta="Fecha cuota inicial">
        <input type="date" value={fInicial} onChange={(e) => setFInicial(e.target.value)} autoFocus />
      </Campo>
      <Campo etiqueta="Valor cuota inicial">
        <input type="number" inputMode="decimal" step="any" min="0" value={vInicial} onChange={(e) => setVInicial(e.target.value)} />
      </Campo>
      <Campo etiqueta="Periodicidad de las cuotas intermedias">
        <select value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>
          {PERIODOS.map((p) => <option key={p.v} value={p.v}>{p.t}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Fecha cuota final">
        <input type="date" value={fFinal} onChange={(e) => setFFinal(e.target.value)} />
      </Campo>
      <Campo etiqueta="Valor cuota final">
        <input type="number" inputMode="decimal" step="any" min="0" value={vFinal} onChange={(e) => setVFinal(e.target.value)} />
      </Campo>
      <div className="field-hint">
        El valor restante (venta − cuota inicial − cuota final) se repartirá en partes iguales entre las cuotas intermedias.
      </div>
    </Modal>
  );
}
