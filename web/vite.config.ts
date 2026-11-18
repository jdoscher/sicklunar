import { defineConfig } from "vite";
import { resolve } from "node:path";
const page = (n: string) => resolve(__dirname, `${n}.html`);
export default defineConfig({
  base: "/",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: { home: page("index"), lab: page("lab"), mission: page("mission"), about: page("about"), teachers: page("teachers") },
    },
  },
});
