'use client';
import { useState } from 'react';
import { useUI } from './ui';
import {
  EditarCompromisoModal, GenerarPlanModal, InfoModal, NuevoCompromisoModal, RegistrarPagoModal,
} from './modales';
import {
  estadoPago, formatoFecha, formatoPesos, hoyColombia,
  type Compromiso, type CuotaPlan, type InfoPropietario, type Lote,
} from '@/lib/logic';
import type { Acciones } from './Plataforma';

type ModalAbierto =
  | { tipo: 'info' }
  | { tipo: 'nuevo' }
  | { tipo: 'registrar' }
  | { tipo: 'generar' }
  | { tipo: 'editar'; p: Compromiso }
  | null;

export function LoteDetalle({
  lote,
  info,
  pagos,
  puedeEditar,
  acciones,
  onAtras,
}: {
  lote: Lote;
  info: InfoPropietario | null;
  pagos: Compromiso[];
  puedeEditar: boolean;
  acciones: Acciones;
  onAtras: () => void;
}) {
  const { confirmar, toast } = useUI();
  const [modal, setModal] = useState<ModalAbierto>(null);
  const cerrar = () => setModal(null);
  const hoy = hoyColombia();

  const ordenados = [...pagos].sort((a, b) => a.fecha_programada.localeCompare(b.fecha_programada));
  const total = ordenados.reduce((s, p) => s + (Number(p.valor_programado) || 0), 0);
  const totalReal = ordenados.reduce((s, p) => s + (p.fecha_real ? Number(p.valor_real) || 0 : 0), 0);
  const venta = Number(info?.valor_venta) || 0;
  const saldo = venta - totalReal;

  const eliminarUno = async (p: Compromiso) => {
    const ok = await confirmar({ mensaje: '¿Eliminar este compromiso de pago? Esta acción no se puede deshacer.' });
    if (!ok) return;
    try {
      await acciones.eliminarCompromiso(p.id);
      toast('Compromiso eliminado');
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const eliminarTodos = async () => {
    const ok = await confirmar({
      mensaje: `Esto eliminará los ${ordenados.length} compromiso(s) de pago de este lote. Esta acción no se puede deshacer.`,
    });
    if (!ok) return;
    try {
      await acciones.reemplazarCompromisos(lote.id, []);
      toast('Compromisos de pago eliminados');
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="panel content-panel">
      <div className="content-header" style={{ display: 'block' }}>
        <button className="back-btn" onClick={onAtras}>← Atrás</button>
        <h2>📁 Lote {lote.numero_lote}</h2>
      </div>

      <h3 className="section-title">Información del propietario</h3>
      {!info ? (
        <div className="empty-state">
          Este lote aún no tiene información.
          {puedeEditar && (
            <>
              <br /><br />
              <button className="btn btn-primary" onClick={() => setModal({ tipo: 'info' })}>+ Agregar información</button>
            </>
          )}
        </div>
      ) : (
        <>
          <table className="owner-table">
            <tbody>
              <tr><th>Nombre propietario</th><td>{info.nombre_propietario}</td></tr>
              <tr><th>Valor de venta</th><td className="num">{formatoPesos(info.valor_venta)}</td></tr>
              <tr><th>Fecha de venta</th><td>{formatoFecha(info.fecha_venta)}</td></tr>
              {venta > 0 && <tr><th>Saldo por pagar</th><td className="num">{formatoPesos(saldo)}</td></tr>}
            </tbody>
          </table>
          {puedeEditar && (
            <button className="btn" style={{ marginTop: 14 }} onClick={() => setModal({ tipo: 'info' })}>✏️ Editar información</button>
          )}
        </>
      )}

      <div className="section-block">
        <h3>
          Compromisos de pago
          {puedeEditar && (
            <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => setModal({ tipo: 'generar' })}>⚙️ Generar automático</button>
              <button className="btn" onClick={() => setModal({ tipo: 'nuevo' })}>+ Agregar compromiso</button>
              <button className="btn" onClick={() => setModal({ tipo: 'registrar' })}>💰 Registrar pago</button>
              {ordenados.length > 0 && (
                <button className="btn btn-danger-text" onClick={eliminarTodos}>🗑️ Eliminar todos</button>
              )}
            </span>
          )}
        </h3>

        {!ordenados.length ? (
          <div className="empty-state">Aún no hay compromisos de pago registrados.</div>
        ) : (
          <div className="table-wrap">
            <table className="pay-table">
              <thead>
                <tr>
                  <th>Fecha programada</th>
                  <th>Valor programado</th>
                  <th>Fecha real</th>
                  <th>Valor real</th>
                  <th>Estado</th>
                  {puedeEditar && <th></th>}
                </tr>
              </thead>
              <tbody>
                {ordenados.map((p) => {
                  const st = estadoPago(p, hoy);
                  return (
                    <tr key={p.id}>
                      <td data-label="Fecha programada">{formatoFecha(p.fecha_programada)}</td>
                      <td className="num" data-label="Valor programado">{formatoPesos(p.valor_programado)}</td>
                      <td data-label="Fecha real">{formatoFecha(p.fecha_real)}</td>
                      <td className="num" data-label="Valor real">{p.fecha_real ? formatoPesos(p.valor_real) : '—'}</td>
                      <td data-label="Estado" className="td-estado"><span className={'status-badge ' + st.cls}>{st.label}</span></td>
                      {puedeEditar && (
                        <td className="td-acciones">
                          <div className="row-actions">
                            <button className="btn-ghost" title="Editar" aria-label="Editar" onClick={() => setModal({ tipo: 'editar', p })}>✏️</button>
                            <button className="btn-ghost" title="Eliminar" aria-label="Eliminar" onClick={() => eliminarUno(p)}>🗑️</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="td-vacia-movil">Total</td>
                  <td className="num" data-label="Total programado">{formatoPesos(total)}</td>
                  <td className="td-vacia-movil"></td>
                  <td className="num" data-label="Total pagado">{formatoPesos(totalReal)}</td>
                  <td className="td-vacia-movil"></td>
                  {puedeEditar && <td className="td-vacia-movil"></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {venta > 0 && ordenados.length > 0 && Math.round(total) !== Math.round(venta) && (
          <div className="field-hint" style={{ marginTop: 10 }}>
            ⚠️ El total programado ({formatoPesos(total)}) no coincide con el valor de venta ({formatoPesos(venta)}).
          </div>
        )}
      </div>

      {modal?.tipo === 'info' && (
        <InfoModal existente={info} onClose={cerrar} onGuardar={(d) => acciones.guardarInfo(lote.id, d)} />
      )}
      {modal?.tipo === 'nuevo' && (
        <NuevoCompromisoModal onClose={cerrar} onGuardar={(d) => acciones.crearCompromiso(lote.id, d)} />
      )}
      {modal?.tipo === 'registrar' && (
        <RegistrarPagoModal
          compromisos={ordenados}
          onClose={cerrar}
          onGuardar={(c, fecha_real, valor_real) => acciones.actualizarCompromiso(c.id, { fecha_real, valor_real })}
        />
      )}
      {modal?.tipo === 'editar' && (
        <EditarCompromisoModal existente={modal.p} onClose={cerrar} onGuardar={(d) => acciones.actualizarCompromiso(modal.p.id, d)} />
      )}
      {modal?.tipo === 'generar' && (
        <GenerarPlanModal
          info={info}
          existentes={ordenados.length}
          onClose={cerrar}
          onGuardar={(cuotas: CuotaPlan[]) => acciones.reemplazarCompromisos(lote.id, cuotas)}
        />
      )}
    </div>
  );
}
