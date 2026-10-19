// After the web build: lists every file in dist/ with its hash and signs the
// list. The desktop apps read this to find out whether a newer web build exists
// and to check what they download (see desktop/main.cjs).
//
//   node scripts/make-update-manifest.mjs [distDir]
//
// The signing key is read from UPDATE_SIGNING_KEY (a PEM) or from
// desktop/signing/update-private.pem. Without a key the manifest is still
// written but unsigned, and the apps will ignore it.
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const dist = path.resolve(process.argv[2] || "dist")
const MIN_SHELL = "3.1.0" // the oldest desktop shell that can run this web build
const SKIP = new Set(["update-manifest.json", "update-manifest.sig"])

function walk(dir, base = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = base ? `${base}/${entry.name}` : entry.name
    return entry.isDirectory() ? walk(path.join(dir, entry.name), rel) : [rel]
  })
}

const files = walk(dist)
  .filter((rel) => !SKIP.has(rel))
  .sort()
  .map((rel) => {
    const data = fs.readFileSync(path.join(dist, rel))
    return { path: rel, sha256: crypto.createHash("sha256").update(data).digest("hex"), size: data.length }
  })

// The build id follows the content only, so an identical rebuild is not an update.
const buildId = crypto.createHash("sha256").update(JSON.stringify(files)).digest("hex").slice(0, 32)
const text = JSON.stringify({ buildId, builtAt: new Date().toISOString(), minShell: MIN_SHELL, files })
fs.writeFileSync(path.join(dist, "update-manifest.json"), text)

const sigPath = path.join(dist, "update-manifest.sig")
fs.rmSync(sigPath, { force: true })
const keyFile = path.resolve("desktop/signing/update-private.pem")
const key = process.env.UPDATE_SIGNING_KEY || (fs.existsSync(keyFile) ? fs.readFileSync(keyFile, "utf8") : "")
if (key) {
  fs.writeFileSync(sigPath, crypto.sign(null, Buffer.from(text), key).toString("base64"))
  console.log(`update manifest: ${files.length} files, build ${buildId}, signed`)
} else {
  console.warn(`update manifest: ${files.length} files, build ${buildId}, NOT signed (no signing key) — desktop apps will ignore it`)
}
