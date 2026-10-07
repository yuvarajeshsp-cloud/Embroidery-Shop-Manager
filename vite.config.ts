import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Vite defaults to port 5173 and doesn't read $PORT on its own — without
    // this, an assigned port (e.g. from a preview tool avoiding a conflict
    // with another project) is silently ignored and Vite keeps binding to
    // 5173 anyway.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
})
