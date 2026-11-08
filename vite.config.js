import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        imH5: fileURLToPath(new URL("./im-h5.html", import.meta.url)),
      },
      external: ["/sdk/latentx-voice.js"],
    },
  },
});
