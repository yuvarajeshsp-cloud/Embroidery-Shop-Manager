import * as React from "react"
import { Capacitor } from "@capacitor/core"
import { Loader2, Fingerprint } from "lucide-react"

import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/lib/use-auth"
import { authenticateWithBiometry, getBiometryAvailability, isBiometricUnlockEnabled, setBiometricUnlockEnabled } from "@/lib/biometric-unlock"
import { getBiometricCredentials, hasBiometricCredentials, saveBiometricCredentials, clearBiometricCredentials } from "@/lib/biometric-credentials"

// Passkeys (WebAuthn) are a desktop/mobile *browser* feature, not something
// the app's embedded native WebView reliably supports — same split the
// product owner asked for: biometrics for the app, passkeys for browsers.
const supportsPasskey = !Capacitor.isNativePlatform() && typeof window !== "undefined" && !!window.PublicKeyCredential

// After a manual sign-in, offer to remember the password (in the Keychain,
// see biometric-credentials.ts) so the user can sign back in with Face ID/
// Touch ID instead of retyping it — including after a full sign-out, which
// otherwise has no other route back in except the password form. Silent
// once already opted in, so a routine password change while signed in and
// unlocked keeps the saved copy in sync automatically.
async function fetchDisplayName(email: string): Promise<string | null> {
  const { data } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("email", email)
    .maybeSingle()
  return data?.display_name || null
}

async function maybeSaveBiometricLogin(email: string, password: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const availability = await getBiometryAvailability()
  if (!availability?.isAvailable) return

  if (await isBiometricUnlockEnabled()) {
    await saveBiometricCredentials(email, password, await fetchDisplayName(email))
    return
  }
  if (await hasBiometricCredentials()) return

  const label = availability.biometryTypes.includes(2) ? "Face ID" : availability.biometryTypes.includes(1) ? "Touch ID" : "Fingerprint"
  if (window.confirm(`Sign in faster next time with ${label}? You can turn this off anytime in My Profile.`)) {
    await saveBiometricCredentials(email, password, await fetchDisplayName(email))
    await setBiometricUnlockEnabled(true)
  }
}

export function AuthScreen() {
  const { signIn, signUp } = useAuth()
  const [loading, setLoading] = React.useState(false)
  const [passkeyLoading, setPasskeyLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handlePasskeySignIn = async () => {
    setError(null)
    setPasskeyLoading(true)
    const { error } = await supabase.auth.signInWithPasskey()
    setPasskeyLoading(false)
    if (error) setError(error.message)
  }

  // Lets a user sign back in with Face ID/Touch ID after a full sign-out,
  // instead of retyping their password. Only offered once credentials were
  // saved (opt-in, right after a successful manual sign-in below) and the
  // device actually has usable biometry.
  const [savedLogin, setSavedLogin] = React.useState<{ email: string; name: string; label: string } | null>(null)
  const [bioSignInLoading, setBioSignInLoading] = React.useState(false)

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    void (async () => {
      const availability = await getBiometryAvailability()
      if (!availability?.isAvailable) return
      const creds = await getBiometricCredentials()
      if (!creds) return
      const label = availability.biometryTypes.includes(2) ? "Face ID" : availability.biometryTypes.includes(1) ? "Touch ID" : "Fingerprint"
      setSavedLogin({ email: creds.email, name: creds.displayName || creds.email, label })
    })()
  }, [])

  const handleBiometricSignIn = async () => {
    if (!savedLogin) return
    setError(null)
    setBioSignInLoading(true)
    const ok = await authenticateWithBiometry(`Sign in as ${savedLogin.name}`)
    if (!ok) {
      setBioSignInLoading(false)
      setError("Verification failed or cancelled")
      return
    }
    const creds = await getBiometricCredentials()
    if (!creds) {
      setBioSignInLoading(false)
      setSavedLogin(null)
      setError("Saved sign-in not found — please sign in with your password")
      return
    }
    const { error } = await signIn(creds.email, creds.password)
    setBioSignInLoading(false)
    if (error) {
      // Most likely the password was changed since it was saved.
      await clearBiometricCredentials()
      setSavedLogin(null)
      setError("Your saved sign-in no longer works — please sign in with your password")
    }
  }

  const handleForgetSavedLogin = async () => {
    await clearBiometricCredentials()
    setSavedLogin(null)
  }

  const [signInEmail, setSignInEmail] = React.useState("")
  const [signInPassword, setSignInPassword] = React.useState("")

  const [signUpShopName, setSignUpShopName] = React.useState("")
  const [signUpName, setSignUpName] = React.useState("")
  const [signUpEmail, setSignUpEmail] = React.useState("")
  const [signUpPassword, setSignUpPassword] = React.useState("")
  const [signUpPhone, setSignUpPhone] = React.useState("")

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(signInEmail, signInPassword)
    setLoading(false)
    if (error) {
      setError(error)
      return
    }
    void maybeSaveBiometricLogin(signInEmail, signInPassword)
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signUp(signUpEmail, signUpPassword, signUpName, signUpShopName, signUpPhone)
    setLoading(false)
    if (error) setError(error)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2">
          <img src="/favicon.svg" alt="" className="size-14 rounded-xl shadow-lg" />
          <h1 className="text-2xl font-bold tracking-tight">Business Management System</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in to your account or create a new one</CardDescription>
          </CardHeader>
          <CardContent>
            {savedLogin && (
              <div className="mb-4 flex flex-col gap-3">
                <Button type="button" className="w-full" onClick={handleBiometricSignIn} disabled={bioSignInLoading}>
                  {bioSignInLoading ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
                  Sign in as {savedLogin.name} with {savedLogin.label}
                </Button>
                <button
                  type="button"
                  className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => void handleForgetSavedLogin()}
                >
                  Not you? Forget this saved sign-in
                </button>
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">or sign in manually</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              </div>
            )}
            <Tabs defaultValue="signin">
              <TabsList className="w-full">
                <TabsTrigger value="signin" className="flex-1">Sign In</TabsTrigger>
                <TabsTrigger value="signup" className="flex-1">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="flex flex-col gap-4 pt-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="you@example.com"
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="••••••••"
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      required
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="size-4 animate-spin" />}
                    Sign In
                  </Button>
                </form>

                {supportsPasskey && (
                  <>
                    <div className="my-4 flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs text-muted-foreground">or</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <Button type="button" variant="outline" className="w-full" onClick={handlePasskeySignIn} disabled={passkeyLoading}>
                      {passkeyLoading ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
                      Sign in with a Passkey
                    </Button>
                  </>
                )}
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="flex flex-col gap-4 pt-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="signup-shop">Shop Name</Label>
                    <Input
                      id="signup-shop"
                      placeholder="Your Shop or Business Name"
                      value={signUpShopName}
                      onChange={(e) => setSignUpShopName(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Creates your own private workspace — you'll be its Administrator.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="signup-name">Your Name</Label>
                    <Input
                      id="signup-name"
                      placeholder="Your Name"
                      value={signUpName}
                      onChange={(e) => setSignUpName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      value={signUpEmail}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="signup-phone">Phone Number</Label>
                    <Input
                      id="signup-phone"
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={signUpPhone}
                      onChange={(e) => setSignUpPhone(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      We'll send a verification code to this number (or to your email if the SMS can't be delivered) before your account is active.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="size-4 animate-spin" />}
                    Create Account
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          <a href="https://paavaifashions.com/privacy.html" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">Privacy Policy</a>
          {" · "}
          <a href="https://paavaifashions.com/delete-account.html" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">Delete your account</a>
        </p>
      </div>
    </div>
  )
}
