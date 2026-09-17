import { createClient } from "@supabase/supabase-js"
import { capacitorSupabaseStorage } from "./capacitor-storage"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: capacitorSupabaseStorage,
    // Enables auth.signInWithPasskey() / auth.registerPasskey() — see
    // src/pages/auth.tsx and src/pages/profile.tsx. Requires passkeys to
    // also be turned on for this project in the Supabase dashboard
    // (Authentication > Sign In / Providers > Passkeys), otherwise the
    // server rejects passkey requests with `passkey_disabled` regardless
    // of this flag.
    experimental: { passkey: true },
  },
})
