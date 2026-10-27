# SyncVete: entorno de trabajo compartido

- ChatGPT/Codex y Cursor trabajan directamente en `feature/ui-v2-shell-dashboard-staging`, siguiendo `origin/feature/ui-v2-shell-dashboard-staging` de `https://github.com/guille6720/SyncVete.git`.
- No crear ramas adicionales, ni ramas por herramienta o por tarea. Verificar la rama y los cambios locales antes de editar. Actualizar con avance rápido antes de empezar; si hay cambios ajenos o divergencia, conservarlos y resolver la integración sin sobrescribirlos.
- `main` está reservada para producción. Publicar allí requiere una solicitud de incorporación desde staging y una instrucción expresa del usuario para liberar esa versión. No desplegar ni migrar producción como parte de pruebas.
- El acceso de pruebas es `micuenta66667@gmail.com`; el acceso productivo es `guille67c@gmail.com`. Son cuentas de la aplicación, no identidades para firmar commits. No pedir ni guardar sus contraseñas en el repositorio.
- Staging usa exclusivamente Supabase `owmcrqvnfubyjxrlyhlc` y Vercel `sync-vete-staging`. Producción usa Supabase `lhdksiptpsubktikdses` y Vercel `sync-vete`.
- Conservar el acceso de staging: `https://sync-vete-staging-git-feature-ui-v2-shel-78b6a4-guillermo-c-bmw.vercel.app/dashboard`.
- Antes de publicar, revisar los cambios de la otra herramienta, ejecutar las comprobaciones correspondientes y publicar mediante avance normal. Nunca usar force push ni restablecer cambios ajenos.
- Consultar `docs/entornos-y-ramas.md` para la configuración y recuperación de trabajos anteriores.
