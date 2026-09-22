import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// O GitHub Pages serve um site de projeto em https://<usuario>.github.io/correria/
// — por isso o "base" abaixo. Se você usar um domínio próprio (CNAME) ou um
// site de usuário/organização (repositório "<usuario>.github.io"), troque
// para base: "/".
export default defineConfig({
  plugins: [react()],
  base: "/correria/",
  build: {
    rollupOptions: {
      output: {
        // Recharts e React mudam muito menos que o app: em chunks separados,
        // o cache do navegador sobrevive a cada deploy de conteúdo.
        //
        // Forma de função em vez de objeto: o Rollup (Vite 5) aceita as duas,
        // o Rolldown (Vite 6+) só aceita a função. Com o objeto, o build
        // quebrava em "manualChunks is not a function".
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("lucide-react")) return "icons";
          return undefined;
        },
      },
    },
  },
});
