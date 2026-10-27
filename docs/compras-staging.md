# Compras y catálogo de precios

Implementación del catálogo funcional de Compras para staging, basada en el catálogo existente `7df6f28`. Incluye proveedores, prestadores, productos, categorías propias, vacunas y precios de venta. Cada sección dispone de búsqueda; los productos y precios admiten filtros por proveedor y categoría. La referencia conversacional no expuso el archivo de la maqueta, por lo que no se certifica coincidencia visual exacta con esa imagen.

## Arquitectura y comportamiento

- Se conserva Next.js App Router, Server Actions, los componentes existentes de inventario y el cliente Supabase con la sesión del usuario. No se utiliza una clave administrativa para las operaciones del catálogo.
- Los proveedores y prestadores pertenecen a una organización. Los productos conservan la organización y sucursal del inventario existente.
- Las categorías personalizadas pertenecen a la veterinaria y se asocian a uno de los tipos generales existentes. Esto mantiene compatibles inventario, facturación y vacunación.
- Una vacuna admite proveedores del ámbito `vacunas`; los otros productos admiten proveedores generales. La base verifica organización, tipo, ámbito y disponibilidad. Una referencia ajena se rechaza aunque se envíe directamente por la API.
- Las bajas son lógicas. Un proveedor o categoría vinculados a productos vigentes no se pueden eliminar hasta desvincularlos. Se conservan el registro y la auditoría.
- Los usuarios con `inventory:read` pueden consultar; las escrituras requieren `inventory:write` y la función comercial de inventario en las acciones del servidor. RLS vuelve a comprobar organización y permisos en la base. Las operaciones de compras rechazan llamadas anónimas.

## Monedas y ganancia

`inventory_products.unit_cost` conserva el costo en `cost_currency` (`ARS` o `USD`). `unit_price` expresa siempre el precio final en ARS. El porcentaje es un recargo sobre el costo, no un margen sobre el precio de venta:

```text
costo_ars = costo × (cotización si la moneda es USD; 1 si es ARS)
precio_venta_ars = redondear(costo_ars × (1 + porcentaje / 100), 2)
```

Por ejemplo: USD 12,50, cotización 1.200 y ganancia 40% producen ARS 21.000. Con cotización 1.300 el precio pasa a ARS 22.750.

La cotización es manual, positiva y específica de cada veterinaria, en `purchase_pricing_settings`. No se presupone una cotización de 1 ni se consulta un servicio externo. Una compra con costo USD requiere una cotización configurada. Cambiarla actualiza en una misma transacción los precios calculados de productos USD de esa veterinaria. Los precios manuales siguen expresados en ARS y no se recalculan.

El trigger de producto calcula el precio definitivo en la base e ignora un precio enviado por el cliente si existe porcentaje de ganancia. Las compras recibidas conservan totales y costos por ítem en ARS; al actualizar un producto cuyo costo está en USD se convierte el costo recibido a su moneda original. Anular la compra revierte el stock sin modificar los totales históricos.

## Migraciones

Aplicadas solamente en `SyncVete-Staging` (`owmcrqvnfubyjxrlyhlc`):

1. `20261027153648_compras_catalog_integrity.sql`: tablas de categorías y cotización, RLS y grants mínimos, referencias de categorías por organización, validaciones de proveedor/sucursal/categoría, recálculo y compatibilidad de recepción de compras.
2. `20261027163110_compras_rpc_grants.sql`: revoca el acceso de `PUBLIC` y `anon` a las cuatro operaciones de compras y conserva la ejecución para usuarios autenticados.

La primera migración es transaccional, con límites de bloqueo y ejecución. La referencia compuesta de categorías se agrega con `NOT VALID` y se valida antes de confirmar. No se borran ni recategorizan productos existentes. Se comprobó que staging no tenía productos USD antes de aplicar la migración.

No ejecutar `db push` de toda la carpeta sobre una base existente sin reconciliar su historial: las dos migraciones anteriores del catálogo ya estaban materializadas en staging sin entradas equivalentes en `schema_migrations`. Solo se aplicaron y registraron las dos migraciones de este cambio.

Para una futura adopción en una base con productos USD anteriores, revisar y convertir explícitamente sus precios heredados: el catálogo anterior expresaba precio y costo en la misma moneda. Esa conversión de datos y cualquier cambio de producción quedan fuera de esta entrega. Un rollback de la aplicación puede conservar estas ampliaciones de esquema; no se debe borrar las tablas como mecanismo de rollback.

## Verificación reproducible

Pruebas específicas:

```sh
npm run test:unit --workspace=@sincvete/web -- src/actions/inventory-catalog.test.ts src/lib/purchase-catalog-database.test.ts
npm run test:unit --workspace=@sincvete/shared -- src/__tests__/inventory-schemas.test.ts
npm run typecheck --workspace=@sincvete/web
npm run build --workspace=@sincvete/web
```

Las pruebas PGlite ejecutan SQL real con roles sujetos a RLS; sus helpers de sesión son fixtures locales. Por eso se complementan con verificaciones contra la Data API de staging y el inicio de sesión real de tres usuarios de prueba: administrador, lector y administrador de otra veterinaria.

`scripts/prepare-compras-staging-qa.mjs` exige la URL exacta de staging y genera organizaciones, contraseñas aleatorias y archivos de preparación/limpieza ignorados por Git. Requiere `.env.compras-public.json` con `url` y `key` públicas. No requiere credenciales de producción ni envía mensajes. Ejecutar los archivos SQL generados únicamente en el proyecto de staging verificado.

```sh
node scripts/prepare-compras-staging-qa.mjs
supabase db query --linked --project-ref owmcrqvnfubyjxrlyhlc --file test-results/create-compras-qa.sql
```

Desde `apps/web`, con una aplicación local ya iniciada o el preview de staging indicado en `PLAYWRIGHT_BASE_URL`:

```sh
npx playwright test --config playwright.compras.config.ts
```

La configuración permite únicamente localhost y dominios preview `sync-vete-staging-*.vercel.app`, usa Chrome instalado y desactiva trazas para no guardar credenciales de inicio de sesión. No ejecutar estas pruebas en producción. Al finalizar, ejecutar `test-results/cleanup-compras-qa.sql`: retira las cuentas y archiva las organizaciones de prueba, conservando los registros de auditoría.

## Resultados comprobados

Fecha: 27 de octubre de 2026. Rama: `codex/compras-functional-staging`. Código de aplicación: `919f3cb8f695aabdd856cec57a23a2b7a395664a`.

| Comprobación | Resultado |
| --- | --- |
| Reglas de base y aislamiento | 17/17 aprobadas |
| Regresión de edición y destino oculto por RLS | 2/2 aprobadas |
| Esquemas y cálculo compartido | 8/8 aprobadas |
| Funcionales locales conectadas a staging | 5/5 aprobadas |
| Funcionales sobre preview remoto | 5/5 aprobadas en 1,2 minutos |
| Suite web completa | 154 aprobadas, 1 fallo previo |
| Suite shared completa | 490 aprobadas, 1 fallo previo |
| Tipos y compilación optimizada | Aprobados |
| Lint | 0 errores; 3 advertencias previas en agenda |

Las cinco pruebas funcionales cubren altas, edición y baja de proveedores/prestadores, categorías y vacunas; selección de proveedor propio; costo USD y precio ARS; actualización de cotización; búsqueda vacía; edición repetida; permisos en móvil; ataques por Data API entre veterinarias; recepción y anulación con stock y costos consistentes.

Los dos fallos generales se reprodujeron en una copia de `7df6f28`: `clinic-top-nav-catalog` todavía espera una lista de navegación anterior y `permissions.test.ts` no contempla la expansión de `billing:write` a `billing:cancel`. No se modificaron esas funcionalidades ni sus expectativas.

El asesor de seguridad no señaló las nuevas tablas ni los nuevos triggers. Mantiene advertencias para las cuatro funciones previas `SECURITY DEFINER` de compras, cuyo cuerpo valida usuario, organización y permiso antes de operar. Se retiró su acceso anónimo. Persisten hallazgos previos del proyecto fuera del catálogo y advertencias de dependencias; esta entrega no certifica una auditoría integral del sistema.

El conector de Supabase rechazó las escrituras con `Invalid or expired requestState`; las migraciones se aplicaron mediante la herramienta oficial y se comprobaron después en el catálogo real. Los logs remotos también se verificaron con la herramienta oficial cuando el conector de Vercel devolvió 404.

Preview verificado: https://sync-vete-staging-bun3qfkbz-guillermo-c-bmw.vercel.app/compras (`dpl_9GLWgpjRua9xh6Kicgk5ffj5gmnd`, estado READY, commit `919f3cb`). La corrida remota comprobó también que el contenido móvil estaba cargado y no desbordaba horizontalmente a 390 píxeles.

Los resultados JSON y capturas quedan en `test-results/` local, ignorado por Git. Las cuentas descartables se retiran al finalizar. No se publicaron contraseñas ni archivos de sesión. No se integró la rama a producción ni se aplicaron cambios a la base productiva.
