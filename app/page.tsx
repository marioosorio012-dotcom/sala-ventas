'use client';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { UIProvider } from '@/components/ui';
import { Plataforma, type Rol } from '@/components/Plataforma';

type Perfil = { rol: Rol | 'sin_acceso'; nombre: string | null; email: string };

export default function Inicio() {
  return (
    <UIProvider>
      <Puerta />
    </UIProvider>
  );
}

function Puerta() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [perfil, setPerfil] = useState<Perfil | null | undefined>(undefined);
  const [errorConfig, setErrorConfig] = useState('');

  useEffect(() => {
    let sb;
    try {
      sb = getSupabase();
    } catch (e) {
      setErrorConfig((e as Error).message);
      return;
    }
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) {
      setPerfil(undefined);
      return;
    }
    let vivo = true;
    setPerfil(undefined);
    getSupabase()
      .from('perfiles')
      .select('rol, nombre, email')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => vivo && setPerfil((data as Perfil) ?? null));
    return () => { vivo = false; };
  }, [uid]);

  if (errorConfig) {
    return (
      <div className="login-wrap">
        <div className="modal login-card">
          <h1>Configuración incompleta</h1>
          <p className="error-text">{errorConfig}</p>
        </div>
      </div>
    );
  }
  if (session === undefined || (session && perfil === undefined)) {
    return <div className="loading">Cargando…</div>;
  }
  if (!session) return <Login />;

  if (!perfil || perfil.rol === 'sin_acceso') {
    return (
      <div className="login-wrap">
        <div className="modal login-card">
          <h1>🔒 Cuenta sin acceso</h1>
          <p className="field-hint">
            Tu usuario ({session.user.email}) existe, pero todavía no tiene permiso para ver la plataforma.
            Pídele a un editor que te asigne un rol.
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => getSupabase().auth.signOut()}>Salir</button>
          </div>
        </div>
      </div>
    );
  }

  return <Plataforma session={session} rol={perfil.rol} nombre={perfil.nombre || perfil.email} />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOcupado(true);
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(/invalid/i.test(error.message) ? 'Correo o contraseña incorrectos' : error.message);
      setOcupado(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="modal login-card" onSubmit={entrar}>
        <h1>🏡 Sala de Ventas</h1>
        <div className="field-hint">Lotes La Unión, Antioquia</div>
        <div className="field">
          <label>
            Correo
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          </label>
        </div>
        <div className="field">
          <label>
            Contraseña
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
        </div>
        <div className="error-text">{error}</div>
        <div className="modal-actions">
          <button className="btn btn-primary" type="submit" disabled={ocupado} style={{ width: '100%', justifyContent: 'center' }}>
            {ocupado ? 'Ingresando…' : 'Ingresar'}
          </button>
        </div>
      </form>
    </div>
  );
}
