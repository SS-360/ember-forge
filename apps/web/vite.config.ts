import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function port(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1024 || Number(value) > 65535) throw new Error("Invalid " + name);
  return Number(value);
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: port("EMBERFORGE_WEB_PORT", 5174),
    strictPort: true,
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.local/**", "**/artifacts/**"] },
    proxy: { "/api": "http://127.0.0.1:" + port("EMBERFORGE_API_PORT", 3001) }
  }
});
