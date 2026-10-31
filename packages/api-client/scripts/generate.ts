import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import openapiTS, { astToString } from 'openapi-typescript';

const source = process.env.IACP_OPENAPI_PATH;
if (!source || !existsSync(source)) {
  throw new Error('IACP_OPENAPI_PATH debe apuntar al openapi.json real montado en modo lectura');
}

type OpenApiDocument = Parameters<typeof openapiTS>[0] & {
  components?: { schemas?: Record<string, any> };
};

function technicalDocument(document: OpenApiDocument): OpenApiDocument {
  const copy = structuredClone(document) as OpenApiDocument;
  const schemas = copy.components?.schemas;
  if (!schemas) return copy;

  const access = schemas.CommercialAccess;
  const instance = schemas.CommercialInstanceCreate;
  if (access) {
    access.title = 'Access';
    schemas.Access = access;
  }
  if (instance) {
    instance.title = 'InstanceCreate';
    if (instance.properties?.access)
      instance.properties.access = { $ref: '#/components/schemas/Access' };
    delete instance.properties?.commercial_context;
    delete instance.examples;
    schemas.InstanceCreate = instance;
  }
  delete schemas.CommercialAccess;
  delete schemas.CommercialContext;
  delete schemas.CommercialInstanceCreate;
  delete schemas.OrderContext;

  const removeDeprecatedFields = (value: any): any => {
    if (Array.isArray(value)) return value.map(removeDeprecatedFields);
    if (!value || typeof value !== 'object') return value;
    for (const key of Object.keys(value)) {
      if (key === 'description' || key === 'summary' || key === 'examples') {
        delete value[key];
        continue;
      }
      if (
        ['commercial_context', 'crm_sintetico', 'customer_id', 'order_id', 'product_id'].includes(
          key,
        )
      ) {
        delete value[key];
        continue;
      }
      if (key === '$ref' && typeof value[key] === 'string') {
        value[key] = value[key].replace(
          '#/components/schemas/CommercialInstanceCreate',
          '#/components/schemas/InstanceCreate',
        );
        continue;
      }
      removeDeprecatedFields(value[key]);
    }
    return value;
  };

  return removeDeprecatedFields(copy);
}

const document = JSON.parse(readFileSync(source, 'utf8')) as OpenApiDocument;
const generated = astToString(await openapiTS(technicalDocument(document), { alphabetize: true }));
writeFileSync(
  'src/generated-openapi.ts',
  '// Generado desde el OpenAPI técnico actual de ControlPlaneV2. CRM/comercial no forma parte de V2.\n' +
    generated,
);
console.log('OPENAPI_GENERATION_PASS');
