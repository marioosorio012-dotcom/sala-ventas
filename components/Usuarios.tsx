'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Campo, Modal, useUI } from './ui';

type Usuario = { id: string; email: string; nombre: string | null; rol: 'editor' | 'visor' | 'sin_acceso'; created_at: string };

const NOMBRE_ROL: Record<Usuario['rol'], string> = {
  editor: 'Editor',
  visor: 'Visor',
  sin_acceso: 'Sin acceso',
};

export function Usuarios({ session, onAtras }: { session: Session; onAtras: () => void }) {
  const { toast, confirmar } = useUI();
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [yo, setYo] = useState('');
  const [error, setError] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [claveDe, setClaveDe] = useState<Usuario | null>(null);

  const api = useCallback(
    async (method: string, body?: unknown, query = '') => {
      const res = await fetch('/api/usuarios' + query, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Error del servidor');
      return json;
    },
    [session.access_token],
  );

  const cargar = useCallback(async () => {
    try {
      const r = await api('GET');
      setUsuarios(r.usuarios);
      setYo(r.yo);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api]);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiarRol = async (u: Usuario, rol: Usuario['rol']) => {
    try {
      await api('PATCH', { id: u.id, rol });
      toast('Rol actualizado');
      cargar();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const eliminar = async (u: Usuario) => {
    const ok = await confirmar({ mensaje: `¿Eliminar el usuario ${u.email}? Ya no podrá ingresar a la plataforma.` });
    if (!ok) return;
    try {
      await api('DELETE', undefined, '?id=' + encodeURIComponent(u.id));
      toast('Usuario eliminado');
      cargar();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="panel content-panel">
      <div className="content-header" style={{ display: 'block' }}>
        <button className="back-btn" onClick={onAtras}>← Atrás</button>
        <h2>👥 Usuarios</h2>
      </div>
      <div className="field-hint" style={{ marginBottom: 14 }}>
        <b>Editor</b>: puede crear, editar y eliminar todo. <b>Visor</b>: solo consulta. <b>Sin acceso</b>: no puede ver nada.
      </div>

      {error ? (
        <div className="error-text">{error}</div>
      ) : !usuarios ? (
        <div className="loading">Cargando…</div>
      ) : (
        <div className="table-wrap">
          <table className="users-table">
            <thead>
              <tr><th>Correo</th><th>Nombre</th><th>Rol</th><th></th></tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}{u.id === yo && ' (tú)'}</td>
                  <td>{u.nombre || '—'}</td>
                  <td>
                    <select
                      value={u.rol}
                      disabled={u.id === yo}
                      onChange={(e) => cambiarRol(u, e.target.value as Usuario['rol'])}
                    >
                      {(Object.keys(NOMBRE_ROL) as Usuario['rol'][]).map((r) => (
                        <option key={r} value={r}>{NOMBRE_ROL[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn-ghost" title="Cambiar contraseña" aria-label="Cambiar contraseña" onClick={() => setClaveDe(u)}>🔑</button>
                      {u.id !== yo && (
                        <button className="btn-ghost" title="Eliminar usuario" aria-label="Eliminar usuario" onClick={() => eliminar(u)}>🗑️</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button className="btn btn-block" onClick={() => setNuevo(true)}>+ Nuevo usuario</button>

      {nuevo && (
        <NuevoUsuarioModal
          onClose={() => setNuevo(false)}
          onGuardar={async (d) => {
            await api('POST', d);
            toast('Usuario creado');
            cargar();
          }}
        />
      )}
      {claveDe && (
        <ClaveModal
          usuario={claveDe}
          onClose={() => setClaveDe(null)}
          onGuardar={async (password) => {
            await api('PATCH', { id: claveDe.id, password });
            toast('Contraseña actualizada');
          }}
        />
      )}
    </div>
  );
}

function NuevoUsuarioModal({
  onClose,
  onGuardar,
}: {
  onClose: () => void;
  onGuardar: (d: { email: string; nombre: string; password: string; rol: string }) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('visor');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const guardar = async () => {
    setError('');
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return; }
    setOcupado(true);
    try {
      await onGuardar({ email, nombre, password, rol });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setOcupado(false);
    }
  };

  return (
    <Modal
      titulo="Nuevo usuario"
      onClose={onClose}
      acciones={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={ocupado || !email.trim()}>Crear</button>
        </>
      }
    >
      <Campo etiqueta="Correo (será su usuario)">
        <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </Campo>
      <Campo etiqueta="Nombre (opcional)">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </Campo>
      <Campo etiqueta="Contraseña inicial" ayuda="Mínimo 8 caracteres. Compártela con la persona por un medio privado.">
        <input type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Campo>
      <Campo etiqueta="Rol">
        <select value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="visor">Visor (solo consulta)</option>
          <option value="editor">Editor (puede modificar todo)</option>
        </select>
      </Campo>
      <div className="error-text">{error}</div>
    </Modal>
  );
}

function ClaveModal({
  usuario,
  onClose,
  onGuardar,
}: {
  usuario: Usuario;
  onClose: () => void;
  onGuardar: (password: string) => Promise<void>;
}) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const guardar = async () => {
    setError('');
    if (p1.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return; }
    if (p1 !== p2) { setError('Las contraseñas no coinciden'); return; }
    setOcupado(true);
    try {
      await onGuardar(p1);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setOcupado(false);
    }
  };
  return (
    <Modal
      titulo={'🔑 Contraseña de ' + usuario.email}
      onClose={onClose}
      acciones={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={ocupado}>Guardar</button>
        </>
      }
    >
      <Campo etiqueta="Nueva contraseña">
        <input type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} autoFocus />
      </Campo>
      <Campo etiqueta="Confirmar contraseña">
        <input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />
      </Campo>
      <div className="error-text">{error}</div>
    </Modal>
  );
}
