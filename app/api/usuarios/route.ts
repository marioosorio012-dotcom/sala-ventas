import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Administración de usuarios. Solo la usan editores y corre en el servidor
// con la llave de servicio (SUPABASE_SERVICE_ROLE_KEY), que nunca llega al navegador.

export const dynamic = 'force-dynamic';

const ROLES = ['editor', 'visor', 'sin_acceso'] as const;
type Rol = (typeof ROLES)[number];

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('El servidor no tiene configurada SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function exigirEditor(req: NextRequest): Promise<{ sb: SupabaseClient; uid: string } | NextResponse> {
  let sb: SupabaseClient;
  try {
    sb = admin();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
  const { data: perfil } = await sb.from('perfiles').select('rol').eq('id', data.user.id).single();
  if (perfil?.rol !== 'editor') return NextResponse.json({ error: 'Solo los editores pueden administrar usuarios' }, { status: 403 });
  return { sb, uid: data.user.id };
}

function esRol(v: unknown): v is Rol {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v);
}

export async function GET(req: NextRequest) {
  const auth = await exigirEditor(req);
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.sb
    .from('perfiles')
    .select('id, email, nombre, rol, created_at')
    .order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ usuarios: data, yo: auth.uid });
}

export async function POST(req: NextRequest) {
  const auth = await exigirEditor(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const nombre = String(body.nombre ?? '').trim();
  const rol = body.rol;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Correo inválido' }, { status: 400 });
  }
  if (password.length < 8) return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });
  if (!esRol(rol)) return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });

  const { data, error } = await auth.sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre },
    app_metadata: { rol_inicial: rol },
  });
  if (error) {
    const msg = /already|registered|exists/i.test(error.message) ? 'Ya existe un usuario con ese correo' : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  // Por si el trigger no asignó el rol (p. ej. el usuario ya tenía perfil)
  await auth.sb.from('perfiles').upsert({ id: data.user.id, email, nombre: nombre || null, rol });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const auth = await exigirEditor(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'Falta el usuario' }, { status: 400 });

  if (body.rol !== undefined) {
    if (!esRol(body.rol)) return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
    if (id === auth.uid && body.rol !== 'editor') {
      return NextResponse.json({ error: 'No puedes quitarte a ti mismo el rol de editor' }, { status: 400 });
    }
    const { error } = await auth.sb.from('perfiles').update({ rol: body.rol }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (body.password !== undefined) {
    const password = String(body.password);
    if (password.length < 8) return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });
    const { error } = await auth.sb.auth.admin.updateUserById(id, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await exigirEditor(req);
  if (auth instanceof NextResponse) return auth;
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'Falta el usuario' }, { status: 400 });
  if (id === auth.uid) return NextResponse.json({ error: 'No puedes eliminar tu propio usuario' }, { status: 400 });
  const { error } = await auth.sb.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
