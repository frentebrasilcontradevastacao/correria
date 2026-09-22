import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves a project site at https://<user>.github.io/correria/,
// hence the "base" below. With a custom domain (CNAME) or a user/organisation
// site (a "<user>.github.io" repo), switch it to "/".
export default defineConfig({
  plugins: [react()],
  base: "/correria/",
  build: {
    rollupOptions: {
      output: {
        // Recharts and React change far less often than the app, so separate
        // chunks keep the browser cache alive across content deploys.
        //
        // Function form, not the object form: Rolldown only accepts the
        // function and fails with "manualChunks is not a function".
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
