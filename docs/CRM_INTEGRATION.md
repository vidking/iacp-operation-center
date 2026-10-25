# CRM Simulator: maqueta visual

`/crm` ofrece dashboard, clientes ficticios con dominios .example, catálogo KVM ficticio, formulario de vista previa e historial de pedidos estático. La selección del producto y la confirmación viven solo en memoria de la interfaz. No se crean pedidos, no se calculan precios/cuotas, no se implementan reglas comerciales, no se envían peticiones ni se persisten datos. El historial no cambia al preparar una vista previa.

La implementación del simulador permanece en `CyberFuel/iacp-crm-simulator`, sin cambios ni código copiado. Al integrarla, reemplazar los componentes de maqueta por el módulo independiente o navegación bajo reverse proxy, tras acordar base path, assets, autenticación, cookies y callbacks. `/crm-simulator/*` sigue siendo una posibilidad futura, sin ruta activa ni configuración empresarial.

Las identidades de observación y CRM deberán ser independientes. Nunca reutilizar tokens de IaCoC, bootstrap, administration o approver para CRM. El CRM futuro será responsable de su autorización comercial; IACP conserva la autorización técnica. IaCoC no ejecuta infraestructura ni recuperaciones.
