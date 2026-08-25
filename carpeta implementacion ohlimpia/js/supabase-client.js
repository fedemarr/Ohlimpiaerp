import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const v = new URL(import.meta.url).searchParams.get("v") ?? "";
const q = v ? `?v=${v}` : "";
const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import(`./config.js${q}`);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Guard de sesión centralizado: corre en cada página (todas importan este módulo).
// Top-level await → los importadores esperan al guard antes de consultar datos.
const { aplicarGuard } = await import(`./auth-guard.js${q}`);
await aplicarGuard(supabase);
