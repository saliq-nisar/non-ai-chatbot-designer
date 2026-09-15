import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Builds the single-page app (list, builder, chat page) into dist/web.
export default defineConfig({
  root: "web",
  publicDir: false,
  plugins: [react()],
  // The app imports code from ../shared (types, id helpers).
  server: { fs: { allow: [".."] } },
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    target: "es2022",
  },
});
