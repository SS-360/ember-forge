import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.local/**", "**/artifacts/**"] },
    proxy: { "/api": "http://127.0.0.1:3001" }
  }
});
