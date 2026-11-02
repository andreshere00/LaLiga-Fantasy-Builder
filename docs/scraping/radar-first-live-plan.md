# Plan de activación: primer radar real y ampliación al catálogo

Fecha: 2 de noviembre de 2026. Estado: plan preparado; no se ha ejecutado una
ingesta, publicado una release ni activado DataMB como parte de este trabajo.

Ejecución posterior del 2 de noviembre: se ha publicado un piloto local real de
seis roles. Ver [resultados, validaciones y puertas pendientes](radar-live-pilot-results.md).
El estado anterior describe la preparación del plan, no el estado de esa ejecución.

## Objetivo y alcance

Publicar con el scraper existente un radar real de Pedri, o de otro jugador con
perfil observado e identidad acreditada, y verlo en su ficha Fantasy. Después,
completar la validación de los seis roles y ampliar la cobertura operativa.

El radar conserva su ubicación debajo de **Fantasy outlook**, dentro de
**Overview**, sin enlace independiente **Performance**. Se respetan `7e49f5b` y
`65355d0`. La primera entrega no requiere comparaciones entre jugadores.

Referencias: [plan general](player-radar-coverage-plan.md),
[runbook](radar-operations.md), [auditoría](radar-supply-audit.md) e
[investigación DataMB](datamb-feasibility.md).

## Estado contrastado y decisiones

- El HEAD revisado es `e393bdf`. Ya existen inventario, registro, auditorías,
  adaptador, checkpoints, releases, lectura local, frontend y jobs opcionales.
  Se reutilizan; sólo se corrigen defectos que aparezcan al operar con datos reales.
- El CLI `fantasy-radar-sync fetch` admite `--imports`, pero no lo exige. Sin
  esa opción descarga a través de `/internal/radar/datamb` en scraping.
- Los `.env` locales tienen configuración del servicio de scraping, pero no
  declaran `DATAMB_ENABLED`, `RADAR_DATASET_ROOT` ni `RADAR_STORE_PATH`.
  Los valores predeterminados son proveedor desactivado y rutas vacías. Esto
  no acredita la configuración efectiva de procesos o contenedores en ejecución.
- El adaptador convierte las fracciones originales de 0–1 a percentiles de
  0–100. La ingesta no debe volver a multiplicarlos ni tratarlos como tasas.
- Las tareas DataMB requieren `cohort=null`: el adaptador no acredita una revisión
  de población. Un radar individual no necesita habilitar comparación.
- El runbook exige un piloto amplio, con dos jugadores por rol y una pareja
  comparable. Se distinguirá una **prueba inicial aislada de un radar** de ese
  **piloto de aceptación**. La primera no habilita programación de producción.
  La pareja comparable necesita un suministro congelado autorizado con población
  verificada, o una evolución acreditada del adaptador; queda como dependencia
  explícita para satisfacer el criterio actual del piloto completo.

La consulta web del 2 de noviembre abre el
[perfil de Pedri](https://datamb.football/Pedri_Midfielder_stats/), pero no valida
la extracción con el cliente del proyecto. La herramienta web no pudo recuperar
`robots.txt`. La [guía oficial](https://datamb.football/guide/) describe perfiles
de temporada actual, seis roles y actualización semanal. Acceso, temporada,
columnas y elegibilidad se verificarán de nuevo durante la ejecución real.

## 1. Preparar el entorno y fijar los criterios de aceptación

1. Registrar HEAD, cambios locales, servicios en ejecución, configuración
   efectiva y versión de las imágenes. Conservar los cambios locales existentes.
2. Revisar conectividad API → scraping, token interno y almacenamiento durable.
   No mostrar valores de secretos en logs ni informes.
3. Preparar `staging/`, `published/` y un directorio separado de revisión con
   `registry.json`, `audits.json` y `captures/`. El job escribe datos; la API sólo
   lee publicaciones; los inputs revisados son de sólo lectura para el job.
4. Para contenedores, comprobar propiedad UID/GID 999 y permisos de lectura de
   archivos generados. Alinear los mounts de API y job.
5. Documentar en el runbook el alcance de la prueba aislada y su diferencia con
   el piloto completo. Mantener `RADAR_JOB_ENABLED=false` y timers desactivados.

**Salida:** entorno reproducible, rutas acordadas y criterios separados para
primer radar, aceptación amplia y activación programada.

## 2. Validar una captura real con el adaptador existente

1. Comprobar las condiciones de acceso aplicables al uso previsto y la política
   robots mediante el transporte real. No declarar aprobaciones sin evidencia.
2. Habilitar `DATAMB_ENABLED=true` únicamente en el entorno de prueba preparado.
3. Consultar la ruta privada autenticada con
   `profile_key=Pedri_Midfielder_stats` y `season=2026-27`. Mantener robots,
   concurrencia 1, límite de una petición cada cinco segundos y guardas actuales.
4. Guardar el JSON `DataMBPlayer` devuelto como captura de auditoría. Conservar
   URL observada, momento de recuperación y evidencias de revisión por separado.
5. Contrastar nombre, club del periodo, rol, temporada, minutos y las siete
   etiquetas y valores en su orden publicado. Verificar finitud, escala y ceros
   reales. No atribuir una fecha de actualización que la captura no acredita.
6. Ante 403/429, bloqueo de robots o contrato inesperado, registrar el resultado
   y resolver la causa antes de continuar; no cambiar de canal para eludirlo.

**Salida:** captura real validada de centrocampista, o un bloqueo concreto
documentado. Abrir el perfil en un navegador no satisface este criterio.

## 3. Acreditar identidad y suministro del primer jugador

1. Obtener el catálogo público completo mediante `inventory`, fijando temporada
   y un `--minimum-count` justificado. No copiar 750 como total observado.
2. Localizar el ID maestro real del jugador; nunca usar `playerTeamId` ni un ID
   de ejemplo. Los entrenadores quedan fuera del denominador de futbolistas;
   las posiciones desconocidas se conservan para revisión.
3. Registrar la correspondencia Fantasy → URL DataMB observada. Aportar evidencia
   adicional al nombre, revisar club y periodo, y dejar homónimos ambiguos.
4. Crear una decisión `matched` versionada: nombre exacto esperado por el
   adaptador, evidencias, revisor, fecha y ventana de validez.
5. Crear la auditoría del perfil `midfielder_v1`: rol fuente, temporada, siete
   etiquetas y claves ordenadas, receta, evidencia y aprobaciones justificadas.
   Calcular `capture_hash` con `radar.files.content_id` sobre el JSON semántico;
   no con el hash de los bytes del archivo formateado.
6. Asignar un único rol predeterminado para esa temporada y `cohort=null`.
   Validar registro y auditoría con los comandos existentes.

**Salida:** catálogo íntegro y al menos una tarea aprobada. El resto del catálogo
permanece contabilizado con sus estados reales de revisión o ausencia.

## 4. Ejecutar y publicar la primera release

Ejecutar desde `backend/api`, dentro del entorno que tenga las rutas montadas y
la conectividad privada configurada. `N_MIN` debe haberse definido a partir de la
auditoría del catálogo. En contenedores se puede usar el job existente, que
ejecuta el mismo CLI y mantiene la identidad de almacenamiento.

```bash
uv run fantasy-radar-sync inventory --season 2026-27 --work-dir /data/radar/staging --minimum-count "$N_MIN"
uv run fantasy-radar-sync registry --registry /data/radar-review/registry.json
uv run fantasy-radar-sync audit --audits /data/radar-review/audits.json --captures /data/radar-review/captures

review=(--work-dir /data/radar/staging --registry /data/radar-review/registry.json --audits /data/radar-review/audits.json --captures /data/radar-review/captures)
uv run fantasy-radar-sync plan "${review[@]}"
uv run fantasy-radar-sync fetch "${review[@]}"
uv run fantasy-radar-sync validate "${review[@]}" --stale-days 8 --maximum-days 30
uv run fantasy-radar-sync publish --validated /data/radar/staging/validated.json --root /data/radar/published
uv run fantasy-radar-sync report --root /data/radar/published
```

Revisar cada resultado antes de pasar al siguiente. `audit` puede dejar cinco
roles bloqueados; la prueba aislada sólo incluye el rol aprobado. `plan` debe
proponer al menos una tarea y `fetch` debe producir un checkpoint válido real.
No basta con que el proceso termine con código cero: el informe debe confirmar
al menos un radar completo. No usar `--imports` en esta primera prueba del scraper.

Configurar la API con `RADAR_DATASET_ROOT=/data/radar/published`,
`RADAR_STORE_PATH` vacío, `RADAR_STALE_DAYS=8` y `RADAR_MAXIMUM_DAYS=30`.
Reiniciar o recrear los procesos necesarios para aplicar configuración y mounts.
Conservar ID de release, catálogo, informe, hashes y procedencia. Respetar el
límite de 5 MiB por archivo y 10 000 snapshots; no ampliarlo para pasar la prueba.

**Salida:** release inmutable activa con al menos un radar real, cobertura del
catálogo completo y configuración de lectura local.

## 5. Verificar API, ficha y conservación de datos

- Consultar `GET /players/{id_maestro}/stats/radar?season=2026-27` con JWT de
  aplicación. Comprobar `status=available`, perfil predeterminado, siete valores,
  minutos, temporada y trazabilidad de release en cobertura.
- Abrir la ficha real, no `/players/radar-preview`. Contrastar gráfico y tabla
  con la captura. Verificar Overview → Fantasy outlook → radar, carga automática
  y ausencia del enlace Performance, en móvil/escritorio y ambos temas.
- Verificar comparación deshabilitada con explicación de población no acreditada.
  No fabricar una cohorte para completar el recorrido.
- Reiniciar workers y bloquear la salida del job/proveedor en el entorno de
  prueba: los GET siguen leyendo la release local y conservan los mismos datos.
- Probar refresco fallido, reanudación y segunda ejecución sin duplicados.
  Conservar último éxito y fecha original; distinguir error operativo de ausencia.
  Usar pruebas controladas para caducidad, identidad/esquema inválidos y fallos
  de disco, sin alterar evidencias ni provocar bloqueos reales del proveedor.
- Probar rollback a una release anterior válida si existe; en una primera
  publicación, preparar otra release válida de prueba para verificar la vuelta.
  No asumir que existe una release previa.

**Salida:** evidencia visual y respuesta API archivadas, siete valores cotejados,
lectura independiente del proveedor y recuperación comprobada. Este hito cierra
el objetivo inmediato del primer radar visible.

## 6. Completar roles, piloto amplio y descubrimiento

1. Revalidar Oblak y Mbappé con sus URLs ya observadas. Descubrir perfiles reales
   de central, lateral y extremo mediante enlaces observados o un manifiesto
   permitido; nunca construir URLs a partir de nombres.
2. Completar la matriz de los seis perfiles: etiquetas exactas, orden,
   definiciones, unidades originales, escala, minutos y temporada. Un cambio
   semántico exige versión nueva de perfil/receta y nueva auditoría.
3. Añadir fixtures reales permitidas y pruebas de regresión donde falten:
   permutación de columnas, fracciones fuera de rango, NaN, temporada distinta,
   cero frente a ausencia e identidad incorrecta.
4. Publicar el piloto amplio del runbook: dos jugadores por rol y casos de
   ambigüedad, traspaso, alta, temporada ausente, métrica ausente, minutos bajos
   acreditados y fallo de fuente. Resolver por separado la dependencia de la
   pareja comparable; mientras siga pendiente, no declarar completo ese gate.
5. Resolver el mecanismo permitido de descubrimiento a escala: índice público
   utilizable, manifiesto acordado o feed autorizado. Los CSV/XLSX excluidos no
   son un fallback. Si no existe mecanismo, mantener el alcance observado y
   registrar la expansión como bloqueada por suministro, sin inventar enlaces.

**Salida:** seis roles acreditados, informe del piloto y decisión explícita sobre
descubrimiento y comparación. La primera prueba visible no depende de resolver
todo el catálogo.

## 7. Ampliar y activar operación programada

Ampliar las correspondencias en lotes revisables y repetir la misma secuencia.
Medir IDs contabilizados, asociación, radares completos, elegibilidad conocida y
desconocida, desglose por club/rol, antigüedad, errores y ausencias. Mantener el
100 % de IDs contabilizados; no prometer 100 % de radares.

Usar motivos precisos sólo cuando haya evidencia: identidad pendiente, rol sin
resolver, fuente sin publicación, temporada no disponible o métricas incompletas.
`insufficient_minutes` exige minutos y umbral de la misma muestra. Una página
fallida no demuestra ausencia de datos ni minutos insuficientes.

Después de superar las puertas de suministro y piloto vigentes, activar el
inventario diario y refresco semanal con los jobs/timers existentes. Fijar
temporada, Europe/Madrid, locks, backups, rollback y monitorización. Alertar por
fallos persistentes, regresiones o falta de éxito superior a ocho días; conservar
la caducidad máxima de treinta días en API y jobs.

## Cambios previstos y validación

Entregar primero evidencias y configuración del radar individual; después,
auditorías/fixtures de seis roles y correcciones demostradas; por último,
expansión y activación operativa. Los datos operativos y manifiestos revisados
viven fuera del repositorio; documentar versiones e informes sin publicar secretos.

No se prevén rutas nuevas ni rediseño frontend. Si las pruebas reales requieren
correcciones, concentrarlas en `providers/datamb/`, `radar/`, `radar_sync`, lector
de releases o contratos afectados, conservando los componentes actuales.

Ejecutar las pruebas focalizadas pertinentes: `test_datamb.py` en scraping;
`test_radar_audits.py`, `test_radar_registry.py`, `test_radar_sync.py`,
`test_radar_published.py` y `test_player_radar.py` en API; y
`playerRadar.test.tsx`, `player-radar.spec.ts` y `player-detail-ux.spec.ts` cuando
afecte al frontend. Las pruebas con mocks no sustituyen la verificación de la
ficha contra la release real. Aplicar los checks y cobertura del repositorio
según las correcciones, y regenerar OpenAPI/esquemas sólo si cambian contratos.

La preparación de este plan sólo ha incluido lectura de código, documentación,
configuración local sin exponer secretos y consulta web de referencia. No se
han ejecutado tests, capturas mediante el scraper, publicaciones ni despliegues.
