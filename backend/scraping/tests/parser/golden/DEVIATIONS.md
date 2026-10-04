# Deviations from a hand-written sample

The user Markdown sample named in the parser plan is not in this repository.
`raphinha_laliga_26_27.reference.md` is therefore the same bytes as
`raphinha_laliga_26_27.expected.md`: the renderer output for the synthetic
Raphinha fixture.

There is no cell difference to allow. When a hand-edited sample is added, the
only cells that may differ are the ones in plan section 4.8:

- Partidos LaLiga, column "Eventos (iconos)"
- Partidos LaLiga, column "Estadísticas crudas"
- Estado fantasy, row "Forma"
- Posición, row "Mapa de campo"
- Puntos fantasy intro line
- An extra `## Noticias` section
- Calendario reciente, column "Minutos / notas"

A difference outside that list fails `test_markdown_golden_snapshot_matches_file`
because the two files are compared in full while they stay identical.
