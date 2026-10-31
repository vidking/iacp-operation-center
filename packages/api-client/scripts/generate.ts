import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const source = process.env.IACP_OPENAPI_PATH;
if (!source || !existsSync(source)) {
  throw new Error('IACP_OPENAPI_PATH debe apuntar al openapi.json real montado en modo lectura');
}

const document = JSON.parse(readFileSync(source, 'utf8')) as {
  openapi?: string;
  info?: { version?: string; title?: string };
  paths?: Record<string, unknown>;
};
const generated =
  '// Generado desde OpenAPI real. No editar manualmente.\\n' +
  'export const source = ' +
  JSON.stringify(
    {
      openapi: document.openapi,
      title: document.info?.title,
      version: document.info?.version,
      paths: Object.keys(document.paths ?? {}).sort(),
    },
    null,
    2,
  ) +
  ' as const;\\n';
writeFileSync('src/generated-openapi.ts', generated);
console.log('OPENAPI_GENERATION_PASS');
