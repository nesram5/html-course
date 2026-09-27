# Criterios de aceptación del MVP (brief §11) — estado

Estado de cada criterio de la sección 11 del brief, con la evidencia que hay en el repositorio.
Lo que no se puede comprobar desde el código (despliegue real, redes de los pilotos) queda
marcado como pendiente de operaciones. Actualizar este documento al cerrar cada punto.

| Criterio                                                                                        | Estado  | Evidencia / qué falta                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF-01 a RF-18 implementados y con pruebas de aceptación                                         | ✅      | Matriz de trazabilidad en `docs/virtual-office-mvp/04-plan-desarrollo.md`; tests unitarios, de integración y E2E (`pnpm test`, `pnpm test:e2e`)                                                                                               |
| E2E de dos navegadores: se ven moverse, se conectan por proximidad y se desconectan al alejarse | ✅      | `e2e/tests/realtime.spec.ts`, `e2e/tests/hallway.spec.ts`                                                                                                                                                                                     |
| Salas: el servidor silencia las pistas de pasillo y nadie del pasillo oye a quien entra         | ✅      | `meeting-room-media.int.test.ts` (LiveKit real), `e2e/tests/meeting-rooms.spec.ts`                                                                                                                                                            |
| Carga: 50 clientes en un espacio con RNF-01 cumplido                                            | ✅ / ⏳ | 50 bots, p95 65,8 ms (`docs/load-test.md`). **Pendiente:** los 60 fps en el portátil de referencia contra _staging_ (aquí solo hay Chromium sin GPU)                                                                                          |
| Beta con HTTPS, errores monitorizados, copias, servidor de medios propio y TURN validado        | ⏳      | Todo preparado (`infra/app`, `infra/livekit`, `docs/runbook.md`). **Pendiente:** el primer despliegue de beta, una prueba de restauración en la VM real y rellenar la tabla de redes de los pilotos del runbook (TURN en ≥ 1 red corporativa) |
| 5 equipos piloto invitados                                                                      | ⏳      | Guía para pilotos en `docs/pilot-welcome.md`. **Pendiente:** tarea de producto                                                                                                                                                                |

## Compatibilidad de navegadores (RNF-03)

Los E2E automáticos solo corren en Chromium (el entorno de CI no tiene Firefox ni WebKit con
cámara falsa). Antes de invitar a los pilotos, pasar a mano la lista de
[compatibilidad-navegadores.md](./compatibilidad-navegadores.md) en las dos últimas versiones de
Chrome, Edge, Firefox y Safari, y anotar el resultado allí.

## Pendiente conocido tras la revisión final

- **Salir de un espacio por decisión propia:** hoy solo se pierde la membresía si la
  administración te expulsa o si borras la cuenta. Se puede pedir a la administración.
- **Carrera al entrar:** un cambio de estilo, de escritorio o de enlace de Meet que ocurra justo
  mientras alguien entra puede no llegarle hasta el siguiente cambio o la siguiente entrada.
  Poco probable y sin pérdida de datos.
- **_Webhooks_ de LiveKit:** dos protecciones (H-12, H-13 de `security-review.md`) dependen de
  que LiveKit entregue sus _webhooks_ a la app; comprobarlo en la VM de medios real.
- **Pestaña que vuelve a conectarse:** si la red vuelve durante los ~45 s en que el SDK de
  LiveKit aún reintenta por su cuenta, puede quitar un momento el audio y vídeo a la pestaña que
  se está usando; esa pestaña los recupera sola en ~1 s.
