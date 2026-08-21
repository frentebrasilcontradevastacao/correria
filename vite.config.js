import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves a project site at https://<usuario>.github.io/correria/
// — por isso o "base" abaixo. Se você usar um domínio próprio (CNAME) ou um
// site de usuário/organização (repositório "<usuario>.github.io"), troque
// para base: "/".
export default defineConfig({
  plugins: [react()],
  base: "/correria/",
});
