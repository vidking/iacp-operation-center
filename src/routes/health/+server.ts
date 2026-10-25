// Liveness de IaCoC, sin consultas a infraestructura ni exposición de configuración.
export const GET = () =>
  Response.json({ status: "ok", application: "iacoc", mode: "MOCK" });
