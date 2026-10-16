import { createClient } from "@supabase/supabase-js"
import { capacitorSupabaseStorage } from "./capacitor-storage"
import { configureProbe, startConnectivityMonitor } from "./offline/connectivity"
import { configureOffline, createOfflineFetch, startSync } from "./offline/engine"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

configureOffline({ url: supabaseUrl, anonKey: supabaseAnonKey, token: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null })
configureProbe(supabaseUrl, supabaseAnonKey)

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  // Saves what the app reads and queues changes made with no connection.
  global: { fetch: createOfflineFetch((input, init) => fetch(input, init)) },
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

startConnectivityMonitor()
startSync()
