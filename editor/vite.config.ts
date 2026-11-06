import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "inkora-classic-file-build",
      apply: "build",
      transformIndexHtml: {
        order: "post",
        handler(html) {
          return html
            .replace(/\s+crossorigin/g, "")
            .replace('type="module"', "defer");
        },
      },
    },
  ],
  build: {
    outDir: "../build/editor",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        format: "iife",
      },
    },
  },
  test: {
    environment: "node",
  },
});
