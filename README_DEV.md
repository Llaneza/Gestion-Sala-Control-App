# README_DEV — Gestión Sala Control App

## Estado actual del proyecto

Esta app sirve para la gestión de personal a turnos de la Sala de Control.

La app ya tiene implementado:

- Login de administrador y modo lectura.
- Editor de ausencias.
- Gestión de vacaciones, entrenamiento y bajas.
- Calendario de turnos.
- Estadísticas.
- Planificación oficial guardada.
- Botón de recalcular planificación.
- Firebase Realtime Database.
- Tema claro/oscuro automático.
- Algoritmo de autoasignación separado y protegido.

---

## Norma principal

El algoritmo de planificación NO debe tocarse salvo petición expresa.

Archivo protegido:

```txt
src/logic/autoAssign.js