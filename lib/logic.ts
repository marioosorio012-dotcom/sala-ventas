// Reglas de negocio puras (sin dependencias), probadas en tests/logic.test.ts

export type Lote = { id: string; numero_lote: string; created_at?: string };

export type InfoPropietario = {
  lote_id: string;
  nombre_propietario: string;
  valor_venta: number | null;
  fecha_venta: string | null; // 'YYYY-MM-DD'
};

export type Compromiso = {
  id: string;
  lote_id: string;
  fecha_programada: string; // 'YYYY-MM-DD'
  valor_programado: number;
  fecha_real: string | null;
  valor_real: number | null;
};

export type EstadoPago = {
  label: 'Retrasado' | 'Pendiente' | 'Pago parcial' | 'Pagado con retraso' | 'Al día';
  cls: 'status-late' | 'status-pending' | 'status-partial' | 'status-ok';
};

/** Fecha de hoy en Colombia como 'YYYY-MM-DD' (no depende de la zona del navegador). */
export function hoyColombia(now: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function estadoPago(p: Pick<Compromiso, 'fecha_programada' | 'valor_programado' | 'fecha_real' | 'valor_real'>, hoy: string = hoyColombia()): EstadoPago {
  if (!p.fecha_real) {
    if (p.fecha_programada && p.fecha_programada < hoy) return { label: 'Retrasado', cls: 'status-late' };
    return { label: 'Pendiente', cls: 'status-pending' };
  }
  const programado = Number(p.valor_programado) || 0;
  const real = Number(p.valor_real) || 0;
  if (real < programado) return { label: 'Pago parcial', cls: 'status-partial' };
  if (p.fecha_real > p.fecha_programada) return { label: 'Pagado con retraso', cls: 'status-partial' };
  return { label: 'Al día', cls: 'status-ok' };
}

export function resumenGeneral(infos: InfoPropietario[], pagos: Compromiso[], hoy: string = hoyColombia()) {
  const totalVentas = infos.reduce((s, r) => s + (Number(r.valor_venta) || 0), 0);
  const totalPagado = pagos.reduce((s, p) => s + (p.fecha_real ? Number(p.valor_real) || 0 : 0), 0);
  const totalRetrasado = pagos.reduce((s, p) => {
    const st = estadoPago(p, hoy);
    if (st.label === 'Retrasado') return s + (Number(p.valor_programado) || 0);
    if (st.label === 'Pago parcial') {
      const diff = (Number(p.valor_programado) || 0) - (Number(p.valor_real) || 0);
      return s + (diff > 0 ? diff : 0);
    }
    return s;
  }, 0);
  return { totalVentas, totalPagado, totalRetrasado };
}

function diasDelMes(y: number, m0: number) {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/**
 * Suma meses a una fecha 'YYYY-MM-DD' sin problemas de zona horaria.
 * Si el día no existe en el mes destino (ej. 31 → febrero) se usa el último día del mes.
 */
export function sumarMeses(fecha: string, meses: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const total = y * 12 + (m - 1) + meses;
  const ny = Math.floor(total / 12);
  const nm0 = total % 12;
  const nd = Math.min(d, diasDelMes(ny, nm0));
  return `${ny}-${String(nm0 + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

export type CuotaPlan = { fecha_programada: string; valor_programado: number };

export type ResultadoPlan = {
  cuotas: CuotaPlan[];
  /** true si no cupo ninguna cuota intermedia y el restante se sumó a la cuota final */
  restanteSumadoAFinal: boolean;
};

/**
 * Genera el plan de pagos:
 * - cuota inicial en fechaInicial
 * - cuotas intermedias cada `periodoMeses` desde la inicial, estrictamente antes de la final
 * - el restante (venta − inicial − final) se reparte en partes iguales entre las intermedias
 *   (redondeado a pesos; la diferencia de redondeo se ajusta en la última intermedia
 *   para que el total del plan sea exactamente el valor de venta)
 * - si no cabe ninguna intermedia, el restante se suma a la cuota final
 */
export function generarPlan(
  fechaInicial: string,
  valorInicial: number,
  periodoMeses: number,
  fechaFinal: string,
  valorFinal: number,
  valorVenta: number,
): ResultadoPlan {
  const intermedias: string[] = [];
  for (let i = 1; ; i++) {
    const f = sumarMeses(fechaInicial, periodoMeses * i);
    if (f >= fechaFinal) break;
    intermedias.push(f);
  }
  const restante = valorVenta - valorInicial - valorFinal;
  const cuotas: CuotaPlan[] = [{ fecha_programada: fechaInicial, valor_programado: valorInicial }];
  let restanteSumadoAFinal = false;

  if (!intermedias.length) {
    if (restante) {
      valorFinal += restante;
      restanteSumadoAFinal = true;
    }
  } else {
    const base = Math.round(restante / intermedias.length);
    intermedias.forEach((f, i) => {
      const esUltima = i === intermedias.length - 1;
      const valor = esUltima ? restante - base * (intermedias.length - 1) : base;
      cuotas.push({ fecha_programada: f, valor_programado: valor });
    });
  }
  cuotas.push({ fecha_programada: fechaFinal, valor_programado: valorFinal });
  return { cuotas, restanteSumadoAFinal };
}

export function formatoPesos(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

export function formatoFecha(v: string | null | undefined): string {
  if (!v) return '—';
  const parts = String(v).slice(0, 10).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return String(v);
}

/**
 * Normaliza una fecha que viene de Excel: objeto Date, número de serie de Excel,
 * 'YYYY-MM-DD' o 'DD/MM/YYYY'. Devuelve 'YYYY-MM-DD' o null.
 */
export function normalizarFecha(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    // ExcelJS entrega las fechas como medianoche UTC
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') {
    // número de serie de Excel (días desde 1899-12-30)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Normaliza un número que viene de Excel ('$ 1.500.000', 1500000, '1500000.5'). */
export function normalizarNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d,.\-]/g, '');
  if (!s) return null;
  // formato colombiano: puntos de miles, coma decimal
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return isFinite(n) ? n : null;
}

export type FilaCompromisoExcel = {
  numero_lote: string;
  fecha_programada: string | null;
  valor_programado: number | null;
  fecha_real: string | null;
  valor_real: number | null;
};

/**
 * Liga cada pago realizado con su compromiso: mismo número de lote y misma fecha
 * programada (y, si hay dos compromisos con la misma fecha, el que tenga el mismo
 * valor programado). Exportado para poder probarlo.
 */
export function ligarPagosRealizados(
  compromisos: FilaCompromisoExcel[],
  realizados: FilaCompromisoExcel[],
): { pagos: FilaCompromisoExcel[]; sinCompromiso: number; ligados: number } {
  const pagos = compromisos.map((c) => ({ ...c, fecha_real: null as string | null, valor_real: null as number | null }));
  let sinCompromiso = 0;
  let ligados = 0;
  for (const r of realizados) {
    const candidatos = pagos.filter(
      (c) => c.fecha_real === null && c.numero_lote === r.numero_lote && c.fecha_programada === r.fecha_programada,
    );
    const elegido =
      candidatos.find((c) => r.valor_programado !== null && c.valor_programado === r.valor_programado) ?? candidatos[0];
    if (!elegido) {
      sinCompromiso++;
      continue;
    }
    elegido.fecha_real = r.fecha_real;
    elegido.valor_real = r.valor_real;
    ligados++;
  }
  return { pagos, sinCompromiso, ligados };
}

