import { sb } from "./supabaseClient.js";

export async function currentUser() {
  const { data } = await sb.auth.getUser();
  return data.user || null;
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

// 監聽登入狀態變化，callback(user|null)
export function onAuthChange(callback) {
  sb.auth.onAuthStateChange((_event, session) => {
    callback(session ? session.user : null);
  });
}
