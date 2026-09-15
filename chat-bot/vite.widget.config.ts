import { defineConfig } from "vite";

// Builds the embeddable Web Chat script into dist/widget/web-chat.js.
// It is a classic (non-module) script so it works with a plain <script src> tag.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist/widget",
    emptyOutDir: true,
    target: "es2019",
    lib: {
      entry: "widget/webChat.ts",
      name: "ChatBotWebChat",
      formats: ["iife"],
      fileName: () => "web-chat.js",
    },
  },
});
