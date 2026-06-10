import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/three-body-simulator/",
  build: { outDir: "dist" },
});
