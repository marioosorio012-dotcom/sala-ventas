'use client';
import type { Compromiso, InfoPropietario, Lote } from './logic';
import { estadoPago, ligarPagosRealizados, normalizarFecha, normalizarNumero } from './logic';

const FMT_PESOS = '"$"#,##0';
const FMT_FECHA = 'dd/mm/yyyy';
export const HOJA_COMPROMISOS = 'Compromisos de pago';
export const HOJA_REALIZADOS = 'Pagos realizados';

function aFechaExcel(s: string | null): Date | null {
  if (!s) return null;
  return new Date(s.slice(0, 10) + 'T00:00:00Z');
}

export async function exportarExcel(lotes: Lote[], infos: InfoPropietario[], pagos: Compromiso[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sala de Ventas La Unión';

  const hLotes = wb.addWorksheet('Lotes');
  hLotes.columns = [
    { header: 'Número de lote', key: 'lote', width: 16 },
    { header: 'Nombre propietario', key: 'nombre', width: 32 },
    { header: 'Valor de venta', key: 'valor', width: 18, style: { numFmt: FMT_PESOS } },
    { header: 'Fecha de venta', key: 'fecha', width: 15, style: { numFmt: FMT_FECHA } },
  ];
  const infoPorLote = new Map(infos.map((i) => [i.lote_id, i]));
  for (const l of lotes) {
    const i = infoPorLote.get(l.id);
    hLotes.addRow({
      lote: l.numero_lote,
      nombre: i?.nombre_propietario ?? '',
      valor: i?.valor_venta ?? null,
      fecha: aFechaExcel(i?.fecha_venta ?? null),
    });
  }

  const nombreLote = new Map(lotes.map((l) => [l.id, l.numero_lote]));
  const filas = pagos
    .map((p) => ({ lote: nombreLote.get(p.lote_id) ?? '', p }))
    .sort((a, b) =>
      a.lote.localeCompare(b.lote, 'es', { numeric: true }) ||
      a.p.fecha_programada.localeCompare(b.p.fecha_programada));

  // Hoja 2: todos los compromisos (lo que se debe pagar)
  const hCompromisos = wb.addWorksheet(HOJA_COMPROMISOS);
  hCompromisos.columns = [
    { header: 'Número de lote', key: 'lote', width: 16 },
    { header: 'Fecha programada', key: 'fp', width: 17, style: { numFmt: FMT_FECHA } },
    { header: 'Valor programado', key: 'vp', width: 18, style: { numFmt: FMT_PESOS } },
    { header: 'Estado', key: 'estado', width: 20 },
  ];
  for (const { lote, p } of filas) {
    hCompromisos.addRow({
      lote,
      fp: aFechaExcel(p.fecha_programada),
      vp: Number(p.valor_programado) || 0,
      estado: estadoPago(p).label,
    });
  }

  // Hoja 3: solo los pagos que ya se hicieron, ligados a su compromiso
  const hRealizados = wb.addWorksheet(HOJA_REALIZADOS);
  hRealizados.columns = [
    { header: 'Número de lote', key: 'lote', width: 16 },
    { header: 'Fecha programada', key: 'fp', width: 17, style: { numFmt: FMT_FECHA } },
    { header: 'Valor programado', key: 'vp', width: 18, style: { numFmt: FMT_PESOS } },
    { header: 'Fecha de pago', key: 'fr', width: 15, style: { numFmt: FMT_FECHA } },
    { header: 'Valor pagado', key: 'vr', width: 18, style: { numFmt: FMT_PESOS } },
    { header: 'Estado', key: 'estado', width: 20 },
  ];
  for (const { lote, p } of filas) {
    if (!p.fecha_real) continue;
    hRealizados.addRow({
      lote,
      fp: aFechaExcel(p.fecha_programada),
      vp: Number(p.valor_programado) || 0,
      fr: aFechaExcel(p.fecha_real),
      vr: Number(p.valor_real) || 0,
      estado: estadoPago(p).label,
    });
  }

  for (const h of [hLotes, hCompromisos, hRealizados]) {
    h.getRow(1).font = { bold: true };
    h.views = [{ state: 'frozen', ySplit: 1 }];
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sala-de-ventas-lotes-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type FilaLoteImport = {
  numero_lote: string;
  nombre_propietario: string;
  valor_venta: number | null;
  fecha_venta: string | null;
};
export type FilaPagoImport = {
  numero_lote: string;
  fecha_programada: string | null;
  valor_programado: number | null;
  fecha_real: string | null;
  valor_real: number | null;
};

function valorCelda(v: unknown): unknown {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    if ('result' in o) return o.result; // fórmula
    if ('text' in o) return o.text; // hipervínculo
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map((t) => t.text).join('');
    }
  }
  return v;
}

function hojaAObjetos(ws: import('exceljs').Worksheet): Record<string, unknown>[] {
  const encabezados: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    encabezados[col] = String(valorCelda(cell.value) ?? '').trim();
  });
  const filas: Record<string, unknown>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const obj: Record<string, unknown> = {};
    let vacia = true;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const k = encabezados[col];
      if (!k) return;
      const v = valorCelda(cell.value);
      if (v !== null && v !== undefined && v !== '') vacia = false;
      obj[k] = v;
    });
    if (!vacia) filas.push(obj);
  });
  return filas;
}

const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

export type ResultadoLectura = {
  lotes: FilaLoteImport[];
  pagos: FilaPagoImport[];
  /** pagos realizados que no se pudieron ligar a ningún compromiso */
  realizadosSinCompromiso: number;
  /** cuántos compromisos quedaron con pago realizado */
  realizadosLigados: number;
};

export async function leerExcel(file: File): Promise<ResultadoLectura> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const hLotes = wb.getWorksheet('Lotes');
  if (!hLotes) throw new Error('El archivo no tiene una hoja llamada "Lotes"');

  const lotes = hojaAObjetos(hLotes)
    .map((r) => ({
      numero_lote: txt(r['Número de lote']),
      nombre_propietario: txt(r['Nombre propietario']),
      valor_venta: normalizarNumero(r['Valor de venta']),
      fecha_venta: normalizarFecha(r['Fecha de venta']),
    }))
    .filter((r) => r.numero_lote);

  const hCompromisos = wb.getWorksheet(HOJA_COMPROMISOS);
  const hRealizados = wb.getWorksheet(HOJA_REALIZADOS);
  const hPagosAntigua = wb.getWorksheet('Pagos'); // formato anterior (una sola hoja)

  if (hCompromisos) {
    const compromisos = hojaAObjetos(hCompromisos)
      .map((r) => ({
        numero_lote: txt(r['Número de lote']),
        fecha_programada: normalizarFecha(r['Fecha programada']),
        valor_programado: normalizarNumero(r['Valor programado']),
        fecha_real: null,
        valor_real: null,
      }))
      .filter((r) => r.numero_lote && r.fecha_programada && r.valor_programado !== null);

    const realizados = (hRealizados ? hojaAObjetos(hRealizados) : [])
      .map((r) => ({
        numero_lote: txt(r['Número de lote']),
        fecha_programada: normalizarFecha(r['Fecha programada']),
        valor_programado: normalizarNumero(r['Valor programado']),
        fecha_real: normalizarFecha(r['Fecha de pago']),
        valor_real: normalizarNumero(r['Valor pagado']),
      }))
      .filter((r) => r.numero_lote && r.fecha_real && r.valor_real !== null);

    const { pagos, sinCompromiso, ligados } = ligarPagosRealizados(compromisos, realizados);
    return { lotes, pagos, realizadosSinCompromiso: sinCompromiso, realizadosLigados: ligados };
  }

  // Compatibilidad con archivos exportados antes del cambio (hoja única "Pagos")
  const pagos = (hPagosAntigua ? hojaAObjetos(hPagosAntigua) : [])
    .map((r) => ({
      numero_lote: txt(r['Número de lote']),
      fecha_programada: normalizarFecha(r['Fecha programada']),
      valor_programado: normalizarNumero(r['Valor programado']),
      fecha_real: normalizarFecha(r['Fecha real']),
      valor_real: normalizarNumero(r['Valor real']),
    }))
    .filter((r) => r.numero_lote && r.fecha_programada && r.valor_programado !== null);
  return {
    lotes,
    pagos,
    realizadosSinCompromiso: 0,
    realizadosLigados: pagos.filter((p) => p.fecha_real).length,
  };
}
