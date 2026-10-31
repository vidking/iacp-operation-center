# Rendimiento V2

Medimos la navegación desde el primer clic hasta el primer shell de la ruta,
separada de la llegada de datos upstream. El presupuesto inicial es:

- Shell compartido: máximo 180 KB gzip.
- Ruta inicial: máximo 350 KB gzip.
- Transición mediana de ruta: máximo 200 ms.

Playwright prueba upstream con 100 ms, 500 ms, 2 s y 10 s. La navegación debe
seguir cambiando de sección, mostrar skeletons locales y actualizar datos cuando
lleguen. Registramos métricas y capturas en test-results; los fixtures se
identifican como pruebas y nunca se incluyen en runtime.
