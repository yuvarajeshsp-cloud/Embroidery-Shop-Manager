# Thiyal Desk — desktop app (Windows and Mac)

An Electron shell around the built web app. It is Chromium inside, so direct
receipt printing (USB, paired Bluetooth, Bluetooth Low Energy) works the same as
in Chrome, and the offline mode works too.

## Build

```
cd desktop
npm install
npm run dist:mac    # release/*.dmg (Apple Silicon and Intel) and *.zip
npm run dist:win    # release/Thiyal Desk Setup <version>.exe (64-bit)
```

`prepare-app` rebuilds the web app first and copies it into `desktop/app`.

## Run without packaging

```
npm run prepare-app && npm start
```

## Updates

The installed apps update their web content by themselves:

1. `npm run build` (in the project root) also writes `dist/update-manifest.json`
   — every file with its hash — and signs it (`update-manifest.sig`) with the
   private key in `desktop/signing/update-private.pem`.
2. Deploying the web app puts those files on the website.
3. Each desktop app checks the website at start and every 3 hours. If the
   signature is valid and the build is newer, it downloads only the changed
   files, checks every hash, and offers "Restart now". It runs the new build
   from the next launch; if that build fails to load it falls back to the
   bundled one.

A new **installer** is only needed when the desktop shell itself changes
(`desktop/main.cjs`, Electron version, printer chooser). Bump `version` in
`desktop/package.json` and `MIN_SHELL` in `scripts/make-update-manifest.mjs`
together when a web build starts to depend on a newer shell.

Keep `desktop/signing/update-private.pem` safe and backed up. Without it no
update can be signed; apps would need a new installer carrying a new public key.
Builds made without the key (e.g. on another machine) are ignored by the apps.

## Notes

- `npm run dist:win:signed` signs the Windows installer with the certificate in
  `desktop/signing/` (git-ignored: a self-signed **test** certificate valid to
  2029 — Windows still warns on other PCs because it is not issued by a trusted
  authority). To remove the warning for real, buy a code-signing certificate
  (or use Azure Trusted Signing) and point `CSC_LINK` / `CSC_KEY_PASSWORD` at it
  instead; nothing else changes.
- Mac installers are **not code-signed**. macOS shows "unidentified developer"
  (right-click → Open the first time); Windows SmartScreen shows "Windows
  protected your PC" (More info → Run anyway). Signing needs an Apple Developer
  ID and a Windows code-signing certificate.
- Passkeys are not available in the desktop app (they are tied to the website
  address); email + password sign-in works.
- The app is served from a private `app://shop` address; data stays on the
  computer (IndexedDB) for offline use.
