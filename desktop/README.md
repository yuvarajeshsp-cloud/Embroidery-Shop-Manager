# Shop Manager — desktop app (Windows and Mac)

An Electron shell around the built web app. It is Chromium inside, so direct
receipt printing (USB, paired Bluetooth, Bluetooth Low Energy) works the same as
in Chrome, and the offline mode works too.

## Build

```
cd desktop
npm install
npm run dist:mac    # release/*.dmg (Apple Silicon and Intel) and *.zip
npm run dist:win    # release/Shop Manager Setup <version>.exe (64-bit)
```

`prepare-app` rebuilds the web app first and copies it into `desktop/app`.

## Run without packaging

```
npm run prepare-app && npm start
```

## Notes

- The installers are **not code-signed**. macOS shows "unidentified developer"
  (right-click → Open the first time); Windows SmartScreen shows "Windows
  protected your PC" (More info → Run anyway). Signing needs an Apple Developer
  ID and a Windows code-signing certificate.
- Passkeys are not available in the desktop app (they are tied to the website
  address); email + password sign-in works.
- The app is served from a private `app://shop` address; data stays on the
  computer (IndexedDB) for offline use.
