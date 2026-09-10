// Must be the very first module evaluated (imported first in main.tsx, before
// anything that touches "./lib/supabase") — the Supabase client parses and
// strips an invite/recovery link's token out of the URL as soon as it
// initializes, so this has to read it first in order to tell "you followed
// an invite link" apart from "you opened the app normally."
const target = window.location.hash || window.location.search
if (target.includes("type=invite")) {
  sessionStorage.setItem("pendingAuthType", "invite")
} else if (target.includes("type=recovery")) {
  sessionStorage.setItem("pendingAuthType", "recovery")
}

export {}
