import tailwindcss from "@tailwindcss/vite";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      adapter: adapter({ out: ".artifacts/build" }),
      csp: {
        mode: "nonce",
        directives: {
          "default-src": ["self"],
          "script-src": ["self"],
          "style-src": ["self", "unsafe-inline"],
          "img-src": ["self", "data:"],
          "connect-src": [
            "self",
            ...(process.env.NODE_ENV === "development" ? ["ws:" as const] : []),
          ],
          "frame-ancestors": ["none"],
          "base-uri": ["none"],
          "form-action": ["self"],
          "object-src": ["none"],
        },
      },
    }),
  ],
  ssr: { noExternal: ["@lucide/svelte"] },
  server: { allowedHosts: ["iacoc-web"] },
  test: { include: ["tests/**/*.test.ts"], setupFiles: ["tests/setup.ts"] },
});
