# Stack técnico V2

Usamos React, TypeScript strict, Vite, TanStack Router, TanStack Query,
Tailwind CSS 4, componentes UI propios con primitivas accesibles, Motion,
Lucide, React Hook Form y Zod.

El backend usa Node.js LTS, Fastify, Argon2id, SQLite y el cliente tipado
derivado del OpenAPI. Vitest, React Testing Library, Playwright y MSW cubren las
pruebas. El mock IACP se inicia únicamente con el perfil de pruebas Docker.

Las versiones quedan fijadas en package-lock.json después de resolverlas dentro
de Docker y se revisan por vulnerabilidades y licencias antes de publicar.
