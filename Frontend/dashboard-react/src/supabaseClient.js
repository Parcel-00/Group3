import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("DEBUG: Env variables are missing! Check if .env is in the dashboard-react folder.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);