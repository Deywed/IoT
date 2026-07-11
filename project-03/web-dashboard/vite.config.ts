import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Za lokalni razvoj (npm run dev): proxy /api ka Analytics servisu na hostu.
// U Docker-u ovaj proxy ne radi ništa jer nginx radi reverse-proxy (nginx.conf).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true },
    },
  },
});
