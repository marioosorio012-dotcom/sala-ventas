'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

/** Trae todas las filas de una tabla, paginando (Supabase devuelve máx. 1000 por consulta). */
export async function traerTodo<T>(tabla: string, orden: string): Promise<T[]> {
  const sb = getSupabase();
  const tam = 1000;
  const out: T[] = [];
  for (let desde = 0; ; desde += tam) {
    const { data, error } = await sb.from(tabla).select('*').order(orden).range(desde, desde + tam - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < tam) break;
  }
  return out;
}
