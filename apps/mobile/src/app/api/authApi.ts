import { supabase } from "../lib/supabase";

export const authApi = {
  signIn(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
  },
  signOut() {
    return supabase.auth.signOut();
  },
  getSession() {
    return supabase.auth.getSession();
  },
};
