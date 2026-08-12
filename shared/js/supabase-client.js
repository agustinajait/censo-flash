// Cliente de Supabase para las páginas de Umbral 0. A diferencia de Censo
// Flash (contraseña compartida por rol), Umbral 0 usa cuentas reales de
// Supabase Auth: cada persona se loguea con su email/contraseña, y las
// políticas RLS de la base deciden qué puede ver/editar según su rol
// (tabla `perfiles`). Este módulo es el único lugar que sabe cómo hablar
// con Supabase — las páginas de Umbral 0 lo usan sin tocar el SDK directo.
//
// Requiere `project.supabaseUrl` + `project.supabaseAnonKey` (ver config/umbral-0.js).
(function(){

let _client = null;
let _sdkPromise = null;
let _adminActionClient = null;

function loadSdk(){
  if(window.supabase) return Promise.resolve(window.supabase);
  if(_sdkPromise) return _sdkPromise;
  _sdkPromise = new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    s.onload = ()=> resolve(window.supabase);
    s.onerror = ()=> reject(new Error('No se pudo cargar el SDK de Supabase (¿sin conexión?)'));
    document.head.appendChild(s);
  });
  return _sdkPromise;
}

async function getClient(cfg){
  if(_client) return _client;
  cfg = cfg || window.PROJECT_CONFIG;
  if(!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey){
    throw new Error('Este proyecto no tiene supabaseUrl/supabaseAnonKey configurados en su config.');
  }
  const sdk = await loadSdk();
  _client = sdk.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return _client;
}

// Cliente secundario, con su propio storage aislado, para acciones de
// administración que crean OTRAS cuentas (ej. dar de alta el login de una
// dupla desde admin-duplas.html) sin pisar la sesión de quien está logueado
// haciendo esa alta. persistSession:false porque es de uso puntual — no hace
// falta mantener viva la sesión del usuario recién creado.
async function getAdminActionClient(cfg){
  if(_adminActionClient) return _adminActionClient;
  cfg = cfg || window.PROJECT_CONFIG;
  if(!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey){
    throw new Error('Este proyecto no tiene supabaseUrl/supabaseAnonKey configurados en su config.');
  }
  const sdk = await loadSdk();
  _adminActionClient = sdk.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { storageKey: 'sb-umbral0-admin-actions', persistSession: false, autoRefreshToken: false },
  });
  return _adminActionClient;
}

// Crea una cuenta de Supabase Auth para OTRA persona (ej. una dupla) sin
// afectar la sesión de quien la está creando. Devuelve el user id nuevo —
// después hay que insertar/actualizar su fila en `perfiles` con el cliente
// principal (getClient), que sí tiene permiso vía RLS si quien llama es
// admin/coordinacion (ver umbral-0/schema-ajustes.sql).
async function crearCuenta(email, password){
  const client = await getAdminActionClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if(error) throw error;
  // Limpiar la sesión transitoria del usuario recién creado en este cliente
  // secundario (no afecta al cliente principal ni a quien está logueado).
  await client.auth.signOut().catch(()=>{});
  if(!data || !data.user) throw new Error('Supabase no devolvió el usuario creado.');
  return data.user;
}

async function login(email, password){
  const client = await getClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if(error) throw error;
  return data.session;
}

async function logout(){
  const client = await getClient();
  await client.auth.signOut();
}

async function getSession(){
  const client = await getClient();
  const { data } = await client.auth.getSession();
  return data.session;
}

// Perfil (rol + dupla_id) de quien está logueado. null si no hay sesión o
// todavía nadie le asignó un perfil (rol) — en ese caso el acceso queda
// bloqueado igual, porque las políticas RLS exigen `perfiles.rol`.
async function getMiPerfil(){
  const client = await getClient();
  const { data: userData } = await client.auth.getUser();
  const user = userData && userData.user;
  if(!user) return null;
  const { data, error } = await client.from('perfiles').select('*').eq('id', user.id).maybeSingle();
  if(error) throw error;
  return data;
}

window.SupabaseClient = { getClient, login, logout, getSession, getMiPerfil, crearCuenta };

})();
