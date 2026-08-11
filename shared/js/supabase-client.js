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

window.SupabaseClient = { getClient, login, logout, getSession, getMiPerfil };

})();
