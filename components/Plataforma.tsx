'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, traerTodo } from '@/lib/supabase';
import {
  formatoPesos, hoyColombia, resumenGeneral,
  type Compromiso, type CuotaPlan, type InfoPropietario, type Lote,
} from '@/lib/logic';
import { exportarExcel, leerExcel } from '@/lib/excel';
import { useUI } from './ui';
import { LoteModal } from './modales';
import { LoteDetalle } from './LoteDetalle';
import { Usuarios } from './Usuarios';

export type Rol = 'editor' | 'visor';

export type Acciones = {
  guardarInfo: (loteId: string, d: { nombre_propietario: string; valor_venta: number | null; fecha_venta: string | null }) => Promise<void>;
  crearCompromiso: (loteId: string, d: { fecha_programada: string; valor_programado: number }) => Promise<void>;
  actualizarCompromiso: (id: string, d: Partial<Omit<Compromiso, 'id' | 'lote_id'>>) => Promise<void>;
  eliminarCompromiso: (id: string) => Promise<void>;
  reemplazarCompromisos: (loteId: string, cuotas: CuotaPlan[]) => Promise<void>;
};

function errorLegible(e: unknown): Error {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/row-level security|permission denied/i.test(msg)) return new Error('No tienes permiso para hacer este cambio');
  if (/Failed to fetch|NetworkError/i.test(msg)) return new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo');
  return new Error(msg);
}

function leerHash(): { vista: 'lista' | 'usuarios' | 'lote'; id?: string } {
  if (typeof window === 'undefined') return { vista: 'lista' };
  const h = window.location.hash.replace(/^#/, '');
  if (h === 'usuarios') return { vista: 'usuarios' };
  if (h.startsWith('lote=')) return { vista: 'lote', id: h.slice(5) };
  return { vista: 'lista' };
}

export function Plataforma({ session, rol, nombre }: { session: Session; rol: Rol; nombre: string }) {
  const sb = getSupabase();
  const { toast, confirmar } = useUI();
  const puedeEditar = rol === 'editor';

  const [cargando, setCargando] = useState(true);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [infos, setInfos] = useState<InfoPropietario[]>([]);
  const [pagos, setPagos] = useState<Compromiso[]>([]);
  const [ruta, setRuta] = useState(leerHash);
  const [modalLote, setModalLote] = useState<{ existente: Lote | null } | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const inputArchivo = useRef<HTMLInputElement>(null);

  // --------- navegación con el botón atrás del navegador/celular ---------
  useEffect(() => {
    const onHash = () => setRuta(leerHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const irA = (hash: string) => {
    if (hash) window.location.hash = hash;
    else history.pushState(null, '', window.location.pathname + window.location.search);
    setRuta(leerHash());
    window.scrollTo(0, 0);
  };

  // --------- carga de datos ---------
  const recargar = useCallback(async () => {
    try {
      const [l, i, p] = await Promise.all([
        traerTodo<Lote>('lotes', 'id'),
        traerTodo<InfoPropietario>('informacion_propietario', 'lote_id'),
        traerTodo<Compromiso>('compromisos_pago', 'id'),
      ]);
      l.sort((a, b) => a.numero_lote.localeCompare(b.numero_lote, 'es', { numeric: true, sensitivity: 'base' }));
      setLotes(l);
      setInfos(i.map((x) => ({ ...x, valor_venta: x.valor_venta == null ? null : Number(x.valor_venta) })));
      setPagos(p.map((x) => ({
        ...x,
        valor_programado: Number(x.valor_programado),
        valor_real: x.valor_real == null ? null : Number(x.valor_real),
      })));
    } catch (e) {
      toast(errorLegible(e).message);
    } finally {
      setCargando(false);
    }
  }, [toast]);

  useEffect(() => {
    recargar();
    // Cambios hechos por otras personas llegan en vivo
    let t: ReturnType<typeof setTimeout> | null = null;
    const programar = () => {
      if (t) clearTimeout(t);
      t = setTimeout(recargar, 400);
    };
    const canal = sb
      .channel('cambios-sala-ventas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lotes' }, programar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'informacion_propietario' }, programar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compromisos_pago' }, programar)
      .subscribe();
    // Al volver a la pestaña, refrescar (por si el celular estuvo suspendido)
    const onVis = () => document.visibilityState === 'visible' && programar();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (t) clearTimeout(t);
      sb.removeChannel(canal);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [recargar, sb]);

  // --------- operaciones ---------
  const correr = async (fn: () => PromiseLike<{ error: unknown }>) => {
    const { error } = await fn();
    if (error) throw errorLegible(error);
    await recargar();
  };

  const crearLote = (numero: string) => correr(() => sb.from('lotes').insert({ numero_lote: numero }));
  const renombrarLote = (id: string, numero: string) => correr(() => sb.from('lotes').update({ numero_lote: numero }).eq('id', id));
  const eliminarLote = (id: string) => correr(() => sb.from('lotes').delete().eq('id', id));

  const acciones: Acciones = {
    guardarInfo: (loteId, d) =>
      correr(() => sb.from('informacion_propietario').upsert({ lote_id: loteId, ...d, updated_at: new Date().toISOString() })),
    crearCompromiso: (loteId, d) => correr(() => sb.from('compromisos_pago').insert({ lote_id: loteId, ...d })),
    actualizarCompromiso: (id, d) => correr(() => sb.from('compromisos_pago').update(d).eq('id', id)),
    eliminarCompromiso: (id) => correr(() => sb.from('compromisos_pago').delete().eq('id', id)),
    reemplazarCompromisos: (loteId, cuotas) =>
      correr(() => sb.rpc('reemplazar_compromisos', { p_lote_id: loteId, p_items: cuotas })),
  };

  const pedirEliminarLote = async (l: Lote) => {
    const ok = await confirmar({
      mensaje: `Esto eliminará el lote "${l.numero_lote}" junto con la información del propietario y todos sus compromisos de pago. Esta acción no se puede deshacer.`,
    });
    if (!ok) return;
    try {
      await eliminarLote(l.id);
      toast('Lote eliminado');
    } catch (e) {
      toast((e as Error).message);
    }
  };

  // --------- Excel ---------
  const exportar = async () => {
    try {
      await exportarExcel(lotes, infos, pagos);
      toast('Excel descargado');
    } catch {
      toast('No se pudo exportar el archivo');
    }
  };

  const importar = async (file: File) => {
    let datos;
    try {
      datos = await leerExcel(file);
    } catch (e) {
      toast((e as Error).message || 'No se pudo leer el archivo');
      return;
    }
    if (!datos.lotes.length) {
      toast('La hoja "Lotes" está vacía');
      return;
    }
    const nombres = new Set(datos.lotes.map((l) => l.numero_lote));
    const pagosValidos = datos.pagos.filter((p) => nombres.has(p.numero_lote));
    const ignorados = datos.pagos.length - pagosValidos.length;
    const ok = await confirmar({
      mensaje:
        `Vas a importar ${datos.lotes.length} lote(s) y ${pagosValidos.length} pago(s).` +
        (ignorados ? ` (${ignorados} pago(s) se ignorarán porque su lote no está en la hoja "Lotes".)` : '') +
        ` Esto REEMPLAZARÁ toda la información actual de la plataforma (${lotes.length} lote(s) existentes). ¿Continuar?`,
      etiqueta: 'Reemplazar todo',
      peligro: true,
    });
    if (!ok) return;
    try {
      const { data, error } = await sb.rpc('importar_todo', { p_lotes: datos.lotes, p_pagos: pagosValidos });
      if (error) throw errorLegible(error);
      irA('');
      await recargar();
      toast(`Importados ${data?.lotes ?? datos.lotes.length} lote(s) y ${data?.pagos ?? pagosValidos.length} pago(s)`);
    } catch (e) {
      toast('Error durante la importación: ' + (e as Error).message);
    }
  };

  // --------- derivados ---------
  const hoy = hoyColombia();
  const resumen = useMemo(() => resumenGeneral(infos, pagos, hoy), [infos, pagos, hoy]);
  const infoPorLote = useMemo(() => new Map(infos.map((i) => [i.lote_id, i])), [infos]);
  const loteActivo = ruta.vista === 'lote' ? lotes.find((l) => l.id === ruta.id) : undefined;
  const filtro = busqueda.trim().toLowerCase();
  const lotesVisibles = filtro
    ? lotes.filter((l) =>
        l.numero_lote.toLowerCase().includes(filtro) ||
        (infoPorLote.get(l.id)?.nombre_propietario ?? '').toLowerCase().includes(filtro))
    : lotes;

  const salir = async () => {
    await sb.auth.signOut();
  };

  return (
    <div className="app">
      <header>
        <h1>🏡 Sala de Ventas · La Unión, Antioquia</h1>
        <div className="header-actions">
          {puedeEditar && ruta.vista !== 'usuarios' && (
            <button className="btn" onClick={() => irA('usuarios')}>👥 Usuarios</button>
          )}
          {puedeEditar && (
            <>
              <button className="btn" onClick={() => inputArchivo.current?.click()}>⬆️ Importar Excel</button>
              <input
                ref={inputArchivo}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importar(f);
                  e.target.value = '';
                }}
              />
            </>
          )}
          <button className="btn" onClick={exportar} disabled={cargando}>⬇️ Exportar a Excel</button>
          <span className="status-pill" title={session.user.email ?? ''}>
            {puedeEditar ? 'Modo edición' : 'Solo lectura'}
          </span>
          <span className="user-chip">{nombre}</span>
          <button className="btn" onClick={salir}>Salir</button>
        </div>
      </header>

      {cargando ? (
        <div className="loading">Cargando información…</div>
      ) : ruta.vista === 'usuarios' && puedeEditar ? (
        <Usuarios session={session} onAtras={() => irA('')} />
      ) : ruta.vista === 'lote' ? (
        loteActivo ? (
          <LoteDetalle
            lote={loteActivo}
            info={infoPorLote.get(loteActivo.id) ?? null}
            pagos={pagos.filter((p) => p.lote_id === loteActivo.id)}
            puedeEditar={puedeEditar}
            acciones={acciones}
            onAtras={() => irA('')}
          />
        ) : (
          <div className="panel content-panel">
            <button className="back-btn" onClick={() => irA('')}>← Atrás</button>
            <div className="empty-state">Este lote ya no existe.</div>
          </div>
        )
      ) : (
        <div className="panel folders-panel">
          <div className="summary-block">
            <h2>Resumen general</h2>
            <div className="summary-grid">
              <div className="summary-card">
                <div className="sc-label">Valor total de ventas</div>
                <div className="sc-value">{formatoPesos(resumen.totalVentas)}</div>
              </div>
              <div className="summary-card">
                <div className="sc-label">Valor total de pagos a la fecha</div>
                <div className="sc-value">{formatoPesos(resumen.totalPagado)}</div>
              </div>
              <div className="summary-card">
                <div className="sc-label">Total pagos retrasados</div>
                <div className="sc-value" style={{ color: 'var(--danger)' }}>{formatoPesos(resumen.totalRetrasado)}</div>
              </div>
            </div>
          </div>

          <div className="content-header lotes-header">
            <h2 className="lotes-title">Información por lotes ({lotes.length})</h2>
            {lotes.length > 6 && (
              <input
                className="search-box"
                type="search"
                placeholder="Buscar lote o propietario"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            )}
          </div>

          {!lotes.length ? (
            <div style={{ padding: '10px 8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Sin lotes todavía.</div>
          ) : !lotesVisibles.length ? (
            <div style={{ padding: '10px 8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Ningún lote coincide con la búsqueda.</div>
          ) : (
            <div className="folder-grid">
              {lotesVisibles.map((l) => {
                const info = infoPorLote.get(l.id);
                return (
                  <div
                    key={l.id}
                    className="folder-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => irA('lote=' + l.id)}
                    onKeyDown={(e) => e.key === 'Enter' && irA('lote=' + l.id)}
                  >
                    {puedeEditar && (
                      <div className="fc-actions">
                        <button
                          className="fc-edit"
                          title="Editar número de lote"
                          aria-label="Editar número de lote"
                          onClick={(e) => { e.stopPropagation(); setModalLote({ existente: l }); }}
                        >✏️</button>
                        <button
                          className="fc-del"
                          title="Eliminar lote"
                          aria-label="Eliminar lote"
                          onClick={(e) => { e.stopPropagation(); pedirEliminarLote(l); }}
                        >🗑️</button>
                      </div>
                    )}
                    <div className="fc-name">📁 Lote {l.numero_lote}</div>
                    <div className="fc-count">{info ? info.nombre_propietario || 'Con información' : 'Sin información'}</div>
                  </div>
                );
              })}
            </div>
          )}
          {puedeEditar && (
            <button className="btn btn-block" onClick={() => setModalLote({ existente: null })}>+ Nuevo lote</button>
          )}
        </div>
      )}

      {modalLote && (
        <LoteModal
          existente={modalLote.existente}
          onClose={() => setModalLote(null)}
          onGuardar={(numero) =>
            modalLote.existente ? renombrarLote(modalLote.existente.id, numero) : crearLote(numero)}
        />
      )}
    </div>
  );
}
