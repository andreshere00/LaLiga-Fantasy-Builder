# Comparación de proveedores y gap analysis

Revisión: **30 de octubre de 2026**. Alcance: los seis planes de viabilidad
aportados y `/tmp/scoutingstats_feasibility_probe.py`. No se implementa ni activa
ningún proveedor. Se asume un primer producto de **partidos terminados**, no datos
en directo.

**Recomendación: ScoutingStats para el primer MVP; Sofascore como candidato de
mayor cobertura, condicionado a resolver el acceso.** Ninguna de las propuestas
demuestra hoy toda la lista de requisitos funcionando de forma desatendida en
producción. Combinar las seis tampoco elimina las brechas ni los bloqueos.

## Decisión entre planes

| Plan | Viabilidad para empezar | Encaje con los requisitos | Decisión |
| --- | --- | --- | --- |
| **ScoutingStats** | La mejor evidencia de extracción amplia mediante HTTP: HTML público y JSON de jugador; transporte del proyecto validado offline | Alineaciones, eventos destacados, muchas estadísticas colectivas, subconjunto individual, plantillas, calendario y fichajes. Momentum sólo como gráfico SVG | **Primera prioridad**, mediante piloto de clubes y partidos; acceso desplegado, cobertura y reutilización pendientes |
| **Sofascore** | JSON observado en navegador, pero las pruebas HTTP convencionales del plan recibieron 403 | La mayor coincidencia con la lista: atributos exactos, fichajes, estadísticas amplias, disparos y momentum. Persisten recursos y campos por auditar | **Primera prioridad para validar acceso**, sin comprometer todavía una integración operativa |
| **Understat** | JSON y normalización sencillos; robots observado prohíbe todas las rutas al agente genérico | Buen complemento para xG, disparos, participantes y producción ofensiva; poca cobertura defensiva y de pases | **Complemento condicionado** a una vía de acceso compatible; adaptador offline posible |
| **DataMB** | Extracción HTML demostrada en tres posiciones y un club; URLs conocidas | Percentiles de temporada y metadatos; no sustituye las métricas brutas ni las estadísticas de partido solicitadas | **Posponer para este objetivo**; útil para un futuro producto de scouting |
| **FootyStats — scraper** | Cloudflare en la prueba directa; extracción HTTP estable sin demostrar | Enriquecimiento de temporada; detalle individual de partido, mapas y eventos sin validar | **Posponer el scraper**; evaluar por separado su API oficial |
| **FBref** | 403/challenge al consultar robots en el plan | Datos básicos; retirada de datos avanzados anunciada por Sports Reference en enero de 2026 | **Última prioridad** para esta lista |

Estas prioridades valoran utilidad para los requisitos y evidencia operativa,
no sólo facilidad de escribir un parser. DataMB es fácil de extraer en la muestra,
pero apenas cierra los requisitos originales. Understat puede ser sencillo de
normalizar y seguir sin ser activable con la política actual.

Sofascore indica que no comparte sus fuentes como endpoints API en su
[FAQ oficial](https://sofascore.helpscoutdocs.com/article/129-sports-data-api-availability).
No se debe interpretar una suscripción de consumidor como un contrato de datos.
ScoutingStats dice que no vende un feed/API estándar en su
[comparativa](https://scoutingstats.ai/es/compare/statsbomb), aunque anuncia
entrega mediante API en [proyectos a medida](https://scoutingstats.ai/solutions).
El acceso y la reutilización requieren aclaración antes de depender de ellos.

## Cómo leer la cobertura

- **V**: publicado y observado en las muestras o expresamente verificado en el plan.
- **P**: parcial, variable o recurso observado sin auditoría del campo exacto.
- **D**: calculable bajo condiciones explícitas; no es un valor directo del proveedor.
- **—**: sin evidencia suficiente en las superficies investigadas; queda fuera del alcance comprometido.

**V no significa cobertura de toda LaLiga ni acceso operativo aprobado.** Los
bloqueos de la tabla anterior afectan también a los recursos cuyos datos existen.
Un guion tampoco prueba que el proveedor nunca disponga del dato: indica que los
planes no justifican implementarlo todavía. En Sofascore se usa P cuando hay un
recurso adecuado pero no un inventario verificable de cada campo en los documentos
aportados. No se han asignado porcentajes globales de cobertura con esta muestra.

## Jugadores: perfil

| Requisito | Sofascore | ScoutingStats | Understat / DataMB / FootyStats / FBref | Gap y decisión |
| --- | --- | --- | --- | --- |
| ATT, CRE, DEF, TAC y TEC | V: `attribute-overviews` | —: publica 17 atributos propios 1–20 | —: DataMB publica siete percentiles según posición; los demás no acreditan esos cinco atributos | Para reproducir los atributos exactos, Sofascore es el único candidato demostrado |
| Historial de fichajes | V: `transfer-history` | V: cinco movimientos en un jugador, importes nulos | FootyStats P; los otros — | Auditar varios jugadores y temporadas; no tratar un importe ausente o cero como fichaje gratuito |

Un historial de clubes en temporadas diferentes no demuestra fechas ni tipos de
traspaso. Los radares de distintos proveedores no son escalas intercambiables.

## Partidos: alineaciones, estadísticas, mapas y eventos

| Requisito | Sofascore | ScoutingStats | Understat | Gap / condiciones |
| --- | --- | --- | --- | --- |
| Alineaciones, titulares, suplentes y formación | V: `lineups` | V en las páginas examinadas | P: participantes, posiciones, minutos y relaciones de sustitución | Understat no demuestra la convocatoria completa ni la formación exacta previa |
| Posesión; xG de equipo | V | V | xG V; posesión — | Mantener identificado el modelo de xG |
| Distancia recorrida | V: 99,4/101,5 km en la muestra del plan | — | — | Sólo Sofascore la acredita; auditar presencia por partido |
| Número de sprints | P: recurso colectivo observado, campo por auditar | — | — | No existe todavía una cobertura operativa demostrada |
| Grandes ocasiones | P | V | — | No inferirlas de un umbral arbitrario de xG |
| Tiros totales, a puerta, fuera, bloqueados, al palo, dentro/fuera del área | P: `statistics` | V | P/D: tiros y resultados/coordenadas; exige definiciones y transformaciones | ScoutingStats aporta estos desgloses colectivos directamente |
| xGOT de equipo | P | V: etiqueta `xG on target` y valores en ambas muestras | — | No equiparar modelos ni usar xGOT colectivo como cobertura individual |
| Paradas totales | P | V: `Saves` | — | Separar portería colectiva e individual |
| Córners, faltas, tiros libres, amarillas y rojas | P | V como estadísticas colectivas; etiquetas pueden omitirse en algunos partidos | P: recuentos individuales de tarjetas; no cronología completa | La ausencia de una fila no debe normalizarse automáticamente a cero |
| Pases totales y precisos | P | V en equipo | — | La cobertura individual es distinta: véase la tabla siguiente |
| Entradas e intercepciones | P | V para totales publicados | — | `Tackles` no demuestra entradas ganadas |
| Entradas ganadas / porcentaje de éxito | P | — | — | No hay denominador o distinción de éxito suficiente en las muestras ScoutingStats |
| Ocasiones claras realizadas | P | P: grandes ocasiones y ocasionalmente falladas | — | No declarar equivalencia con grandes ocasiones creadas o goles; validar significado |
| Pases en profundidad; toques en área rival; faltas recibidas en último tercio | P | — | — | Gap del MVP ScoutingStats |
| Fueras de juego | P | V | — | Recuento colectivo observado |
| Duelos totales y ganados, porcentaje global | P | P: sólo ganados | — | Falta el total de duelos para reproducir la fracción exacta |
| Duelos terrestres y aéreos, intentados/ganados | P/D | —: `Headers won` no acredita todos los duelos aéreos | — | En Sofascore, terrestre puede derivarse sólo con componentes compatibles completos |
| Desposeído | P | — | — | No confundir con pérdidas totales de posesión |
| Regates intentados y completados | P | V en equipo | — | Ratios derivables si ambos conteos están presentes |
| Saques de banda | P | — | — | Gap del MVP |
| Pases al último tercio y precisos/intentados allí | P | — | — | Gap del MVP |
| Balones largos y centros, intentados/acertados | P | V en equipo | — | Guardar ambos conteos; porcentajes calculados con denominador no nulo |
| Recuperaciones y despejes | P | Recuperaciones —; despejes D desde participantes completos | — | La suma exige cobertura de todos los jugadores y definición compatible |
| Errores que llevan a disparo | P | — | — | Gap del MVP |
| Goles evitados de equipo | P | D: xGOT rival menos goles recibidos, previa validación de definiciones | — | No sustituye el valor individual del portero ni garantiza igualdad con Sofascore |
| Grandes paradas; despejes por alto; puños; saques de meta | P | — | — | Portería detallada pendiente de otra fuente |
| Mapa de disparos: origen, minuto, jugador, resultado, situación y pierna | V: `shotmap` | — | V para disparos y contexto publicado | Understat es complemento espacial si se resuelve su acceso |
| xG por disparo | V | — | V | No mezclar modelos en una misma serie sin distinguir fuente |
| xGOT por disparo y destino en portería | P: requiere validar campos y ausencias; el plan observa xGOT bruto en un tiro | — | — | X/Y de Understat describen origen; no destino en portería |
| Mapa de ataques / concentración de juego | P: visual observado, acceso numérico pendiente | — | — | Un conteo de ataques peligrosos no es un mapa espacial |
| Mapa de pases / reparto 34–47–19 % | P: visual observado, contrato numérico pendiente | — | — | Sigue sin una implementación justificada por los planes |
| Goles, cambios, tarjetas, penaltis y VAR como eventos | V para incidencias de la muestra; auditar tipos | V/P: eventos destacados observados | P: goles/disparos y tarjetas agregadas; sustituciones sin cronología exacta | Corpus adicional para penaltis, VAR y rectificaciones |
| Todas las faltas como eventos con minuto y participantes | — en `incidents`; otro recurso por investigar | — | — | **Gap transversal demostrado**: un total de faltas no es un registro de eventos |
| Momentum | V: serie `graph`, 92 puntos en la muestra | P: 92/102 barras SVG, escala temporal/unidades sin validar | —: puede calcularse xG acumulado | No presentar SVG ni xG acumulado como el momentum numérico de Sofascore |

DataMB no aporta datos por partido en las superficies investigadas. FootyStats
scraping no demuestra un documento estable para el detalle requerido; sus
acumulados de temporada no deben convertirse en estadísticas de partido restando
capturas. FBref queda como candidato a alineaciones, eventos resumidos y datos
básicos condicionado al acceso; sus antiguas tablas avanzadas no son un respaldo
válido para esta lista. Sports Reference anunció su retirada en su
[aviso oficial](https://www.sports-reference.com/blog/category/advanced-stats/).

## Estadísticas individuales de un partido

Las repeticiones de la lista original se han unificado. Sofascore tiene el
recurso `lineups` con estadísticas de participantes, pero los planes no aportan un
catálogo comprobable para afirmar disponibilidad universal de cada métrica.

| Métrica solicitada | Sofascore | ScoutingStats en muestras guardadas | Understat en JSON guardado |
| --- | --- | --- | --- |
| Goles y asistencias | P | V: `goals`, `assists` | V |
| Entradas y entradas ganadas | P | Entradas V; ganadas — | — |
| Pases precisos | P | —: `passes` + `pass_acc` redondeado no dan el entero exacto | — |
| Duelos totales/ganados | P | Ganados V; total — | — |
| Duelos terrestres totales/ganados | P/D | — | — |
| Duelos aéreos totales/ganados | P | — | — |
| Tiros a puerta | P | V: `shots_on_target` | D desde resultados de disparos, previa semántica de categorías |
| xG | P | P: 14/32 participantes con valor en un partido y 0/32 en otro | V |
| Tiros fuera y disparos bloqueados del atacante | P | —: tiros totales y a puerta no bastan para separar ambas categorías | D desde disparos/resultados, validando autogoles y categorías |
| Regates intentados/completados | P | Completados V; intentados — | — |
| Acciones defensivas | P | — como métrica independiente | — |
| Despejes | P | V: `clearances` | — |
| Bloqueos defensivos de tiros | P | — | — |
| Intercepciones | P | V: `interceptions` | — |
| Regateado | P | — | — |
| Toques | P | V: `touches` | — |
| Pases clave | P | V: `key_passes` | V |
| Centros intentados/acertados | P | — individual; sí hay totales de equipo | — |
| Pases largos intentados/acertados | P | — individual; sí hay totales de equipo | — |
| Posesión perdida | P | — | — |
| Faltas cometidas | P | V: `fouls` | — |
| Faltas recibidas | P | — | — |
| Fueras de juego | P | — individual; sí hay total de equipo | — |
| Paradas totales del portero | P | — individual; sí hay total de equipo | — |
| Goles evitados del portero | P | — individual | — |
| Puños y despejes por alto del portero | P | — | — |

No definir «acciones defensivas» como una suma arbitraria de entradas,
intercepciones y despejes. Tampoco confundir disparos bloqueados del atacante con
bloqueos realizados por un defensor. Ninguno de DataMB, FootyStats scraping o FBref
demuestra cerrar las brechas individuales restantes con el alcance de sus planes.

## Equipos: temporada

En Sofascore se observó el recurso de estadísticas de temporada del club; cada
campo y el denominador de sus medias deben auditarse. En ScoutingStats se
reinspeccionaron las 29 filas públicas de rendimiento y los dos reportes de partido.
Las derivaciones de temporada requieren **todos los encuentros de la competición,
sin duplicados, con cobertura y reglas compatibles**. Una media redondeada no
permite recuperar con exactitud su total original.

| Requisito | Sofascore | ScoutingStats | Gap / cálculo posible |
| --- | --- | --- | --- |
| Partidos, goles anotados/recibidos y asistencias | P | Partidos y goles D desde calendario completo; asistencias D desde participantes completos | No mezclar competiciones; no sumar plantillas actuales para reconstruir temporadas con fichajes |
| Distancia y sprints por partido | P | — | Sin respaldo en los otros planes |
| Goles por partido | P | V | Existe una media publicada de equipo |
| Goles de penal / penales intentados; goles de falta / intentos | P | P/D desde eventos o disparos, pero sin desglose completo demostrado | Understat permite clasificar disparos por situación si se resuelve acceso; auditar denominadores |
| Goles/tiros dentro y fuera del área | P | Tiros D desde reportes completos; goles por zona — | Understat D con coordenadas/zonas verificadas |
| Goles con izquierda, derecha y cabeza | P | — | Understat D desde `shotType` y resultados de tiros; tratamiento explícito de autogoles |
| Grandes ocasiones por partido | P | V | No equivalen a goles ni a ocasiones falladas |
| Ocasiones claras falladas por partido | P | P/D: campo individual y etiqueta colectiva variable; requiere cobertura | No asumir cero ante ausencia |
| Tiros totales y a puerta por partido | P | V | Medias públicas |
| Tiros fuera y bloqueados por partido | P | D desde reportes completos | No confundir medias de equipo y sumas de participantes incompletos |
| Regates completados y córners por partido | P | V | Medias públicas |
| Tiros libres por partido; tiros al palo | P | D desde reportes completos | Auditar filas omitidas |
| Contraataques | P | — | Ataques peligrosos no equivalen a contraataques |
| Posesión media | P | V | Conservar metodología de promedio publicada |
| Pases precisos: conteo y porcentaje | P | Porcentaje V; conteo D desde reportes colectivos completos | No multiplicar media de pases por media de porcentajes |
| Pases completos en campo propio/contrario | P | — | Gap del MVP |
| Pases largos y centros completados, con porcentaje | P | D desde reportes completos | Sumar aciertos/intentos y luego dividir; no promediar porcentajes sin ponderar |
| Porterías a cero | P | Porcentaje V; conteo D desde resultados completos | No reconstruir conteo desde porcentaje redondeado |
| Goles recibidos por partido | P | V | Media publicada |
| Entradas e intercepciones por partido | P | D desde reportes completos | No demostrar entradas ganadas con el total de entradas |
| Despejes por partido | P | D desde participantes completos | No aparece como campo colectivo en las muestras |
| Paradas por partido | P | D desde reportes; porcentaje de paradas V en temporada | Porcentaje no equivale a conteo |
| Balones recuperados por partido | P | — | Gap del MVP |
| Errores que llevan a disparo/gol | P | — | Gap del MVP |
| Penales cometidos y goles de penal encajados | P | P/D: eventos aún por auditar | No existe desglose completo acreditado en el piloto |
| Despejes en línea de gol; entrada del último hombre | P | — | Gap del MVP |
| Duelos globales/terrestres/aéreos ganados y porcentaje | P | P/D: ganados globales desde partidos; faltan intentados y desgloses exactos | `Headers won` no acredita duelos aéreos completos |
| Posesión perdida por partido | P | — | Gap del MVP |
| Saques de banda y de meta por partido | P | — | Gap del MVP |
| Fueras de juego y faltas por partido; amarillas por partido y rojas | P | D desde reportes completos | Validar cómo se cuentan segunda amarilla y rectificaciones |

Understat complementa ataque y xG, pero no defensa, posesión ni tracking. DataMB
aporta percentiles de siete ejes, no los conteos anteriores. FootyStats presenta
estadísticas de temporada candidatas, algunas Premium, sin una auditoría completa
de los campos y acceso estable. FBref sólo justifica una evaluación de básicos.

## Equipos: plantilla, información y calendario

| Requisito | Sofascore | ScoutingStats | Otros planes / gap |
| --- | --- | --- | --- |
| Plantilla: nombre, posición, dorsal e ID | V | V: 24 jugadores en un club | FootyStats P; FBref candidato básico; DataMB depende de listado externo no validado; Understat participantes de temporada, no plantilla inscrita completa |
| Total de jugadores | P/D: contadores vistos en web, contrato pendiente | D para filas del listado publicado | Contar el listado no garantiza total oficial de inscritos |
| Edad media | P/D: contadores vistos en web | D para jugadores con edad y denominador completo | Definir fecha y conjunto; edades enteras no reproducen necesariamente una media de fechas de nacimiento |
| Jugadores extranjeros | P: contador web, mecanismo pendiente | — como contador validado | Hace falta nacionalidad, regla de doble nacionalidad y referencia del club; no inferir por nombre |
| Jugadores de selección nacional | P: contador web, mecanismo pendiente | — | Hace falta definición de internacional activo y datos explícitos; nacionalidad no demuestra convocatoria |
| Calendario de partidos | P: web observada, descubrimiento paginado pendiente | V: 39 IDs únicos en la muestra, varias competiciones | Understat V para calendario de LaLiga en muestras; FootyStats y FBref candidatos básicos |

## Qué demuestra la prueba de ScoutingStats

Se ejecutó de nuevo, **sin red**, el script aportado usando el entorno instalado:

```bash
PYTHONPATH=backend/scraping/src backend/scraping/.venv/bin/python /tmp/scoutingstats_feasibility_probe.py
```

Resultado correcto: dos snapshots con 32 participantes y 22 titulares cada uno;
42 filas y 39 etiquetas colectivas distintas por partido; 18/17 eventos; diez
cambios por partido; 102/92 barras de momentum; 24 jugadores de plantilla; 39
partidos del calendario; 29 métricas de temporada; 17 atributos propios y cinco
fichajes del jugador. Las pruebas con MockTransport permiten atributos, impiden
la ruta bloqueada de reportes y rechazan HTML donde se esperaba JSON.

La reinspección de los archivos confirma límites que el recuento de filas no revela:

- El xG individual es nulo para los 32 participantes del partido 19732672;
  el 19439271 lo publica para 14. Los valores ausentes no demuestran xG cero.
- El xGOT **colectivo sí aparece** en ambos HTML: 1,52/1,68 y 0,82/2,01.
  Es una cobertura más concreta que la referencia genérica a portería limitada
  del plan, pero no demuestra xGOT por disparo ni goles evitados individuales.
- La ficha de rendimiento sí publica una media de goles evitados con su
  definición. No acredita la cronología ni el desglose por portero de cada partido.
- No hay campos individuales de pases precisos, pases largos, centros, duelos
  terrestres/aéreos ni portería detallada en el array `players` inspeccionado.
- Hay pases precisos **colectivos**; extrapolarlos a individuos sería incorrecto.
- Las 42 filas no son 42 requisitos cubiertos: repiten tiros y xG entre secciones,
  y algunas etiquetas cambian entre partidos.

El script no es un séptimo proveedor ni un scraper de producción. Sus asserts
no comprueban veracidad deportiva, correspondencias con Fantasy, todas las
competiciones, continuidad del servicio, cuotas ni acceso HTTPX desde despliegue.

## Implementación con mayor retorno

1. **Piloto ScoutingStats:** 2–3 clubes y 10–20 partidos con porteros, suplentes,
   tarjetas, penaltis y VAR. Medir disponibilidad por campo, integridad de IDs y
   acceso desde el contenedor de despliegue. Priorizar alineaciones, estadísticas
   colectivas, eventos destacados, plantilla y calendario. Mantener xG individual
   opcional y momentum experimental.
2. **Prueba de acceso Sofascore en paralelo al diseño, sin compromiso operativo:**
   resolver el canal permitido y comprobar HTTPX/robots desde el despliegue.
   Si funciona, auditar 30–50 partidos y los campos de las tablas antes de
   implementarlo como proveedor principal. No convertir Chromium en una solución
   asumida para los 403.
3. **Modelo común e identidades:** IDs de jugador, club, partido, temporada y
   competición; valores decimales, ratios, eventos y coordenadas fuera de los
   contadores de puntos Fantasy. Procedencia por campo y `null` con motivo.
   No mezclar xG de proveedores ni confundir `playerId` con `playerTeamId`.
4. **Persistencia e ingesta incremental:** una descarga de partido compartida por
   ambos equipos y todos sus participantes, caché por proveedor, capturas duraderas,
   límites propios y errores parciales. La caché actual en memoria no conserva
   un histórico tras reinicios.
5. **Understat sólo tras resolver acceso:** añadir mapa de tiros y producción
   ofensiva si cierra una necesidad que el proveedor principal no cubra. Posponer
   DataMB, FBref y el scraper FootyStats para este alcance.

El plan ScoutingStats estima 1–2 días de piloto, 3–5 de adaptador y 2–4 de
integración: **6–11 jornadas**, excluyendo UI completa, persistencia histórica,
negociación y una revisión masiva de identidades. Es un rango del plan, no una
medición ni un presupuesto cerrado. No hay base equivalente para comprometer un
plazo Sofascore mientras el acceso siga sin resolver.

Si se admite una API de pago, evaluar **FootyStats API como alternativa al scraper**.
Su [FAQ oficial](https://footystats.org/api/documentations/faq) documenta uso en
aplicaciones y almacenamiento, cobertura variable por liga y ausencia de datos
en directo. Esto mejora la previsibilidad del acceso; **no demuestra** que cubra
ATT/CRE/DEF/TAC/TEC, momentum, mapas o todo el detalle individual solicitado.
Habría que auditar muestras de LaLiga y el contrato de publicación de la API del
producto antes de contratar o redistribuir datos.

## Fuentes y límites de esta revisión

- Planes locales: [Sofascore](sofascore-feasibility.md),
  [ScoutingStats](scoutingstats-feasibility.md), [DataMB](datamb-feasibility.md),
  [FootyStats](footystats-feasbility.md) y [FBref](fbref-feasibility.md).
- Plan Understat aportado:
  `/Users/aherencia/.codex/visualizations/2026/10/30/01a18c63-9744-7b31-abce-e09893a1914a/understat-viabilidad-tecnica.md`.
- Evidencia local adicional: script y HTML/JSON ScoutingStats en `/tmp`, y
  `/tmp/understat-match.json`, inspeccionados offline.
- Se reconsultaron las páginas oficiales enlazadas de Sofascore, ScoutingStats,
  Sports Reference y FootyStats. El lector web no pudo abrir los robots de
  ScoutingStats, DataMB y Understat ni los tres JSON Sofascore intentados; los
  resultados previos de acceso se atribuyen a los planes, sin presentarlos como
  nuevas pruebas de red exitosas.
- No se hizo una auditoría completa de LaLiga, un despliegue, una prueba de carga,
  una revisión jurídica ni una implementación. Las protecciones existentes no
  se han modificado.
