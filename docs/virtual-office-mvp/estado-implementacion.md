# Estado de la implementación del MVP — Bululu

> **Para:** responsable de producto. **Fecha:** 27-09-2026. **Rama:** `claude/mvp-software-plan-video-gmdpkg`
> (sin publicar en `main` ni desplegar todavía). **Código:** la raíz del repositorio ([`README.md`](../../README.md)).
>
> Resumen en una frase: **todas las etapas E0–E9 y los requisitos RF-01..RF-18 están
> implementados y probados de forma automática en este entorno**; lo que falta para cerrar los
> criterios de aceptación del MVP (brief §11) necesita cuentas y máquinas reales (Google,
> VMs, redes de los pilotos, portátiles con GPU) y está descrito paso a paso en la
> [sección 5](#5-qué-no-se-ha-podido-verificar-aquí-y-cómo-verificarlo).

## Índice

1. [Resultado de la puerta de salida (release gate)](#1-resultado-de-la-puerta-de-salida-release-gate)
2. [Estado por etapa (E0–E9)](#2-estado-por-etapa-e0e9)
3. [Estado por requisito (RF-01..RF-18)](#3-estado-por-requisito-rf-01rf-18)
4. [Resultados medidos](#4-resultados-medidos)
5. [Qué no se ha podido verificar aquí y cómo verificarlo](#5-qué-no-se-ha-podido-verificar-aquí-y-cómo-verificarlo)
6. [Limitaciones conocidas y riesgos aceptados](#6-limitaciones-conocidas-y-riesgos-aceptados)
7. [Cómo ejecutar la aplicación en local](#7-cómo-ejecutar-la-aplicación-en-local)
8. [Cómo desplegar la beta](#8-cómo-desplegar-la-beta)
9. [Documentos relacionados](#9-documentos-relacionados)

---

## 1. Resultado de la puerta de salida (release gate)

Ejecutado el 27-09-2026 desde un estado limpio (sin `node_modules`, `dist` ni `coverage`), en
la máquina de desarrollo compartida (4 núcleos, Node 22.22, pnpm 10.33), con PostgreSQL 16 y el
servidor de desarrollo de LiveKit reales:

| Paso                                         | Resultado                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`             | ✅ (el _lockfile_ coincide con los `package.json`)                                                     |
| `pnpm format:check`                          | ✅ Prettier sin cambios                                                                                |
| `pnpm lint`                                  | ✅ ESLint sin errores ni avisos (`--max-warnings=0`)                                                   |
| `pnpm typecheck`                             | ✅ TypeScript estricto en los 5 paquetes y en `e2e/`                                                   |
| `pnpm test`                                  | ✅ **1 023 tests** en 117 ficheros + 15 comprobaciones de reglas de lint (1 min 56 s)                  |
| `pnpm test:coverage` (`@bululu/shared`)      | ✅ 99,6 % de líneas, 95,6 % de ramas (mínimo exigido: 90 % de líneas)                                  |
| `pnpm build`                                 | ✅ los 5 paquetes                                                                                      |
| `pnpm validate:maps`                         | ✅ 2 plantillas, 8 avatares, 14 objetos de decoración                                                  |
| `pnpm audit --prod --audit-level high`       | ✅ ninguna vulnerabilidad conocida en las dependencias de producción                                   |
| E2E completos (Playwright), 3 veces seguidas | ✅ **3 × 41/41** en verde, sin reintentos (tiempos en la [§4.2](#42-pruebas-de-extremo-a-extremo-e2e)) |

Tests de `pnpm test` por paquete:

| Paquete          | Ficheros |     Tests | Qué cubre                                                                                           |
| ---------------- | -------: | --------: | --------------------------------------------------------------------------------------------------- |
| `@bululu/shared` |       11 |       139 | Contratos zod (REST y tiempo real), lógica pura del mundo (mapa, movimiento, proximidad)            |
| `@bululu/maps`   |        4 |        27 | Plantillas, estilos, avatares, catálogo de decoración, licencias; recursos generados al día         |
| `@bululu/load`   |        3 |        15 | Herramientas de la prueba de carga                                                                  |
| `@bululu/web`    |       52 |       376 | Componentes, _stores_, controlador de medios, accesibilidad, i18n                                   |
| `@bululu/server` |       47 |       466 | Unitarios e **integración con PostgreSQL y LiveKit reales** (auth, espacios, mundo, medios, salas…) |
| **Total**        |  **117** | **1 023** |                                                                                                     |

## 2. Estado por etapa (E0–E9)

| Etapa                                | Estado                   | Qué hay (resumen)                                                                                                                                                                                                                                                                                                                                                                                                          | Evidencia principal                                                                                                                                         |
| ------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E0** Fundaciones                   | ✅                       | Monorepo pnpm (`apps/web`, `apps/server`, `packages/shared`, `packages/maps`, `tools/load`); ESLint estricto con reglas de arquitectura, Prettier, commitlint y _hooks_; esqueletos de servidor (Fastify 5 + Socket.IO + Prisma) y web (Vite + React 19 + i18n); Docker Compose local; CI. El _spike_ E0-S7 se contestó con el código real de E5/E6 ([informe](../spikes/E0-S7-livekit.md)).                               | `.github/workflows/ci.yml` (raíz del repositorio), `scripts/verify-lint-rules.mjs`, `e2e/tests/smoke.spec.ts`                                               |
| **E1** Login con Google y perfil     | ✅                       | OIDC con PKCE y `state`, verificación del `id_token`; sesión en cookie `__Host-bululu_sid` (HttpOnly, Secure, SameSite=Lax); rutas protegidas; nombre editable y 8 avatares. Login de prueba solo fuera de producción.                                                                                                                                                                                                     | `apps/server/src/modules/auth`, `apps/web/src/features/auth`; `auth.int.test.ts`, `google-oidc.test.ts`, `access.spec.ts`                                   |
| **E2** Espacios, acceso y salas      | ✅                       | 2 plantillas validadas; asistente de creación; "Mis espacios"; enlace de invitación regenerable; dominio permitido (con el _claim_ `hd` de Google); miembros, expulsión, readmisión y cambio de rol; creación de un Google Meet por sala (o enlace pegado a mano).                                                                                                                                                         | `apps/server/src/modules/spaces`, `adapters/google-meet.ts`; `spaces.int.test.ts`, `join-invite.spec.ts`                                                    |
| **E3** Motor de mapa 2D              | ✅                       | `parseMap` compartido; escena Phaser 3 por capas; movimiento por casillas con animación; colisiones; cámara, zoom y nombres; puente React ⇄ Phaser.                                                                                                                                                                                                                                                                        | `packages/shared/src/world`, `apps/web/src/features/world/game`; `world.spec.ts`, `world-performance.spec.ts`                                               |
| **E4** Multijugador en tiempo real   | ✅                       | Socket.IO autenticado; estado vivo por espacio detrás de una interfaz sustituible; validación de movimiento en el servidor; _tick_ de 15 Hz con deltas; interpolación de otras personas; reconexión con 30 s de gracia; una pestaña activa por persona.                                                                                                                                                                    | `apps/server/src/modules/world`; `world.int.test.ts`, `space-runtime.test.ts`, `realtime.spec.ts`                                                           |
| **E5** Charla de pasillo (LiveKit)   | ✅                       | Motor de proximidad por pares con histéresis (R = 3, máx. 8); `media:peers`; _token_ de LiveKit; pre-join con vista previa; `MediaController` con suscripción selectiva, _simulcast_ y reconexión; vídeos sobre el mapa, controles y aviso de "pasillo no privado"; LiveKit propio + TURN preparados (`infra/livekit`).                                                                                                    | `packages/shared/src/world/proximity.ts`, `apps/web/src/features/media`; `hallway.int.test.ts`, `media-controller.test.ts`, `hallway.spec.ts`               |
| **E6** Salas con Google Meet         | ✅                       | Sala actual en el estado del jugador; al entrar se corta el pasillo y se ofrece "Unirse a la reunión"; **el servidor silencia las pistas y retira el permiso de publicar** (y el _webhook_ firmado lo repite); ocupación de las salas visible en el mapa.                                                                                                                                                                  | `apps/server/src/modules/rooms`, `modules/media`; `meeting-room-media.int.test.ts`, `meeting-rooms.spec.ts`                                                 |
| **E7** Presencia, chat y reacciones  | ✅                       | Estados Disponible/Ocupado/Ausente con auto-silencio al ocultar la pestaña; lista de personas con Localizar y Escritorio; chat del espacio (últimos 100); reacciones de 3 s; llamar (_ring_) con aviso, notificación y espera de 30 s.                                                                                                                                                                                     | `apps/server/src/modules/presence`, `modules/chat`; `presence.int.test.ts`, `chat.int.test.ts`, `presence-chat.spec.ts`                                     |
| **E8** Lanzamiento de la beta        | ✅ código / ⏳ operación | Sentry y _logs_ estructurados con datos personales filtrados; revisión de seguridad (16 hallazgos, todos corregidos o aceptados); prueba de carga; 41 E2E; despliegue con imágenes, migraciones seguras, copias diarias y _rollback_; accesibilidad (axe + teclado), i18n y GDPR (borrado de cuenta, página de privacidad); panel de métricas O1–O6 y comentarios de pilotos. **Falta ejecutarlo en las VMs reales** (§5). | `infra/app`, `.github/workflows/deploy.yml`, `docs/runbook.md`, `security-review.md`, `load-test.md`; `a11y.spec.ts`, `keyboard.spec.ts`, `product.spec.ts` |
| **E9** Personalización de la oficina | ✅                       | Estilos visuales intercambiables en directo (mín. 2 por plantilla) sobre la misma geometría; reclamar, asignar y liberar escritorios, aparecer junto al propio; decoración con hasta 3 objetos del catálogo; generador reproducible de los recursos gráficos.                                                                                                                                                              | `apps/server/src/modules/desks`, `apps/web/src/features/personalization`, `packages/maps`; `desks.int.test.ts`, `personalization.spec.ts`                   |

## 3. Estado por requisito (RF-01..RF-18)

Rutas relativas a la raíz del repositorio. «Web» = `apps/web/src/features`, «Servidor» = `apps/server/src`.
Todos los tests citados se ejecutaron en verde en esta puerta de salida.

| Requisito                                       | Estado                                           | Código principal                                                                                                                                                                                           | Pruebas principales                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RF-01** Login con Google                      | ✅ (Google real ⏳, §5.1)                        | Servidor `modules/auth` (`oauth-flow.ts`, `auth.service.ts`), `adapters/google-oidc.ts`; Web `auth/pages/LoginPage.tsx`                                                                                    | `auth.int.test.ts`, `google-oidc.test.ts`, `auth.socket.int.test.ts`; E2E `access.spec.ts`                                                                 |
| **RF-02** Perfil y avatar                       | ✅                                               | Servidor `modules/users`; Web `auth/components/AvatarPicker.tsx`, `ProfileForm.tsx`                                                                                                                        | `users.int.test.ts`, `avatar-picker.test.tsx`; E2E `join-invite.spec.ts`, `a11y.spec.ts`                                                                   |
| **RF-03** Crear espacio (+ Meet por sala)       | ✅ (Meet real ⏳, §5.1)                          | Servidor `modules/spaces` (`spaces.service.ts`, `space-rooms.ts`), `adapters/google-meet.ts`; Web `spaces/pages/CreateSpacePage.tsx`                                                                       | `spaces.int.test.ts`, `google-meet.test.ts`, `spaces-pages.test.tsx`; E2E `keyboard.spec.ts`                                                               |
| **RF-04** Acceso: invitación, dominio, expulsar | ✅                                               | Servidor `modules/spaces` (`invite-token.ts`), `modules/auth`; Web `spaces/components/InvitePanel.tsx`, `MembersPanel.tsx`, `AllowedDomainForm.tsx`, `spaces/pages/JoinPage.tsx`                           | `spaces.int.test.ts`, `authorization.int.test.ts`, `join.test.tsx`; E2E `access.spec.ts`, `join-invite.spec.ts`, `realtime.spec.ts` (expulsión en directo) |
| **RF-05** Mapa 2D                               | ✅                                               | `packages/shared/src/world/map.ts`, `tiled.ts`; Web `world/game/scenes`, `world/components/WorldCanvas.tsx`                                                                                                | `WorldCanvas.test.tsx`, `draw-order.test.ts`; E2E `world.spec.ts`                                                                                          |
| **RF-06** Movimiento y colisiones               | ✅                                               | `packages/shared/src/world/movement.ts`, `grid.ts`; Web `world/game/controller`; validación en Servidor `modules/world/space-runtime.ts`                                                                   | `keyboard-input.test.ts`, `local-player-controller.test.ts`, `space-runtime.test.ts`; E2E `world.spec.ts`                                                  |
| **RF-07** Multijugador en tiempo real           | ✅                                               | Servidor `modules/world` (`space-runtime.ts`, `space-state-store.ts`, `world.service.ts`); Web `world/realtime`, `world/game/remote`                                                                       | `world.int.test.ts`, `remote-players.test.ts`, `remote-players.perf.test.ts`; E2E `realtime.spec.ts`; carga (§4.3)                                         |
| **RF-08** A/V por proximidad                    | ✅                                               | `packages/shared/src/world/proximity.ts`; Servidor `modules/world/hallway-peers.ts`, `modules/media`, `adapters/livekit.ts`; Web `media/controller/media-controller.ts`, `media/components/MediaLayer.tsx` | `hallway.int.test.ts`, `media.int.test.ts`, `livekit.int.test.ts`, `media-controller.test.ts`; E2E `hallway.spec.ts`, `hostile.spec.ts`                    |
| **RF-09** Controles de medios y pre-join        | ✅                                               | Web `media/components/PreJoin.tsx`, `MediaControls.tsx`, `DeviceSelect.tsx`, `SpeakerControl.tsx`                                                                                                          | `prejoin.test.tsx`, `media-ui.test.tsx`, `speaker.test.tsx`; E2E `hallway.spec.ts` (silenciar y apagar cámara)                                             |
| **RF-10** Salas con Google Meet                 | ✅ (Meet real ⏳, §5.1)                          | Servidor `modules/rooms`, `modules/media` (silencio en el servidor + _webhook_); Web `rooms/components/RoomsOverlay.tsx`, `RoomCard.tsx`                                                                   | `rooms.int.test.ts`, `meeting-room-media.int.test.ts` (LiveKit real), `room-card.test.tsx`; E2E `meeting-rooms.spec.ts`                                    |
| **RF-11** Estados y auto-silencio               | ✅                                               | Servidor `modules/presence`; `packages/shared/src/world/presence.ts`; Web `presence/lib/presence-activity.ts`, `presence/components/StatusMenu.tsx`                                                        | `presence.int.test.ts`, `presence.service.test.ts`, `presence-activity.test.ts`, `status-menu.test.tsx`; E2E `hallway.spec.ts`, `presence-chat.spec.ts`    |
| **RF-12** Lista de miembros, Localizar          | ✅                                               | Web `presence/components/PeoplePanel.tsx`, `presence/lib/people.ts`                                                                                                                                        | `people-panel.test.tsx`; E2E `presence-chat.spec.ts` («Localizar»), `personalization.spec.ts` («Escritorio»)                                               |
| **RF-13** Chat del espacio                      | ✅                                               | Servidor `modules/chat`; Web `chat/components/ChatPanel.tsx`, `MessageBody.tsx`                                                                                                                            | `chat.int.test.ts`, `chat-panel.test.tsx`, `chat-session.test.ts`; E2E `presence-chat.spec.ts`, `hostile.spec.ts`                                          |
| **RF-14** Reacciones                            | ✅                                               | Servidor `modules/chat/chat.socket.ts`; Web `chat/components/ReactionPicker.tsx`                                                                                                                           | `reactions.test.tsx`, `chat.int.test.ts`; E2E `presence-chat.spec.ts`                                                                                      |
| **RF-15** Llamar (_ring_)                       | ✅ (notificación en navegadores reales ⏳, §5.5) | Servidor `modules/presence/ring-cooldowns.ts`, `presence.socket.ts`; Web `presence/components/RingButton.tsx`, `presence/lib/ring-alert.ts`                                                                | `ring-cooldowns.test.ts`, `ring-alert.test.ts`, `presence.int.test.ts`; E2E `presence-chat.spec.ts`                                                        |
| **RF-16** Estilo de la oficina en directo       | ✅                                               | Servidor `modules/spaces` (`spaces.service.ts`, `space-notifier.ts`); `packages/maps` (estilos); Web `spaces/components/ThemeSettings.tsx`, `world/game/office`                                            | `space-notifier.int.test.ts`, `theme-loader.test.ts`, `color-matrix.test.ts`; E2E `personalization.spec.ts`, `world.spec.ts`                               |
| **RF-17** Mi escritorio                         | ✅                                               | Servidor `modules/desks`, `modules/world/desk-goto.ts`; `packages/shared/src/world/desks.ts`; Web `personalization/components/DeskMenu.tsx`, `MyDeskButton.tsx`, `DeskHud.tsx`                             | `desks.int.test.ts`, `desk-hud.test.tsx`; E2E `personalization.spec.ts`, `product.spec.ts` (se libera al borrar la cuenta)                                 |
| **RF-18** Decorar mi escritorio                 | ✅                                               | Servidor `modules/desks`; catálogo en `packages/maps`; Web `personalization/components/DeskDecorPanel.tsx`                                                                                                 | `desks.int.test.ts`, `maps-catalog.test.ts`; E2E `personalization.spec.ts`, `hostile.spec.ts`                                                              |

Reglas de negocio y requisitos no funcionales destacados:

- **RN-03 / RNF-06** (la sala aísla del pasillo, garantizado por el servidor): `meeting-room-media.int.test.ts`
  contra LiveKit real y `meeting-rooms.spec.ts`.
- **RN-06 / RN-07** (50 por espacio, 8 por conversación): `space-runtime.test.ts`, `hallway.int.test.ts`, prueba de carga.
- **RNF-05** (seguridad): [`docs/security-review.md`](../security-review.md), 16 hallazgos H-1..H-16.
- **RNF-07** (accesibilidad): auditoría axe de todas las páginas y diálogos (`a11y.spec.ts`) y recorrido
  completo solo con teclado (`keyboard.spec.ts`). Lectores de pantalla reales: sin probar (§5.5).
- **RNF-10** (español, preparado para i18n): `i18n-audit.test.ts` impide textos sin traducir en la UI.

## 4. Resultados medidos

### 4.1 Tests unitarios y de integración

**1 023 tests** en verde (tabla de la §1), incluidos los de integración del servidor contra
PostgreSQL 16 y el servidor de desarrollo de LiveKit (`ws://localhost:7880`): conexión real,
suscripción selectiva, silencio forzado por el servidor al entrar en una sala, retirada y
devolución del permiso de publicar, expulsión de LiveKit al perder la membresía.

### 4.2 Pruebas de extremo a extremo (E2E)

41 tests de Playwright (14 ficheros) con Chromium, cámara y micrófono falsos, **servidor de
LiveKit real**, el servidor y la web reales y una base de datos propia (`bululu_e2e_gate`, API en
`:3490`, web en `:5490`), con **un solo _worker_** y **sin reintentos**:

| Ejecución | Resultado | Duración (Playwright) | Duración total (con arranque de servidores) |
| --------- | --------- | --------------------- | ------------------------------------------- |
| 1         | ✅ 41/41  | 12,0 min              | 12 min 3 s                                  |
| 2         | ✅ 41/41  | 11,7 min              | 11 min 45 s                                 |
| 3         | ✅ 41/41  | 11,9 min              | 11 min 57 s                                 |

Qué cubren, entre otros: el flujo 2 del brief completo (enlace → Google → avatar → pre-join →
en el mapa en menos de 30 s); dos y tres navegadores que se ven moverse; conexión de audio y
vídeo por proximidad, desconexión al alejarse y nadie suscrito a quien está lejos; silenciar y
apagar la cámara; pestaña oculta → Ausente con auto-silencio y restauración exacta; Ocupado sale
de la conversación; salas con Meet que cortan el pasillo y lo restauran; corte de red con
«Reconectando…»; segunda pestaña; expulsión en directo; estados, Localizar, chat, reacciones,
_ring_; cambio de estilo en directo; escritorio y decoración; borrado de cuenta; entradas hostiles;
auditoría de accesibilidad y uso solo con teclado; 50 avatares en modo estrés.

La duración supera el objetivo de 10 min de E8-S4 en esta máquina compartida de 4 núcleos
(unos 2 min son el arranque del servidor y de Vite); en el CI de GitHub (máquina dedicada) se
espera menos.

### 4.3 Prueba de carga (tiempo real, RNF-01)

Repetida en esta puerta de salida (27-09-2026) con el servidor **compilado** (`node dist/main.js`),
50 _bots_ de `@bululu/load` en un espacio `office-small@1`, 4 pasos/s cada uno, **3 min**, en la
misma máquina compartida:

| Figura                                                             | Resultado (esta puerta)                                 | Medida completa de E8-S3 (5 min, imagen Docker con 2 CPU) |
| ------------------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------- |
| Latencia de movimiento a otra persona, **p95** (objetivo < 200 ms) | ✅ **65,7 ms** (p50 35,4 · p99 68,5 · máx. 189,8)       | ✅ 65,8 ms (p99 68,3 · máx. 196,7)                        |
| p95 en cada intervalo de 30 s                                      | 65,2 · 65,9 · 65,7 · 65,8 · 65,8 · 65,7 ms              | 65,4–66,2 ms                                              |
| Movimientos enviados / rechazados                                  | 36 015 (200/s) / 0                                      | 59 866 / 0                                                |
| Errores de _socket_ / desconexiones                                | 0 / 0                                                   | 0 / 0                                                     |
| _Tick_ medio del servidor (presupuesto 66 ms)                      | 1,4–1,5 ms                                              | 1,2–1,7 ms                                                |
| Memoria del servidor                                               | RSS 141–166 MB; _heap_ 45,1 → 40,7 MB (sin crecimiento) | RSS 123–133 MB; _heap_ sin tendencia                      |

La latencia la domina la espera al siguiente _tick_ de 15 Hz (hasta 66 ms); no incluye la red
real entre personas y servidor, que se añade en _staging_ (§5.4). Detalle y método en
[`docs/load-test.md`](../load-test.md).

### 4.4 Medios (LiveKit y TURN)

| Comprobación                                                                                                 | Resultado                                                                                                                                   | Dónde                                                                                    |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Integración con LiveKit real (conexión, suscripción selectiva, silencio en el servidor, permisos, _webhook_) | ✅ en esta puerta                                                                                                                           | `livekit.int.test.ts`, `media.int.test.ts`, `meeting-room-media.int.test.ts`             |
| E2E con vídeo real entre navegadores (proximidad, silencio, Ausente, salas)                                  | ✅ 3 × en esta puerta                                                                                                                       | `hallway.spec.ts`, `meeting-rooms.spec.ts`, `hostile.spec.ts`                            |
| CPU del servidor de medios, 12 conversaciones de 4 con vídeo, 10 min                                         | ✅ 10,5 % de una VM de 4 vCPU (objetivo < 60 %)                                                                                             | [`load-test.md`](../load-test.md) (27-09-2026)                                           |
| Ancho de banda del servidor de medios                                                                        | 61,1 Mbps de salida de media (~1,3 Mbps por persona en una conversación de 4)                                                               | ídem                                                                                     |
| TURN sobre TLS en el 443 con UDP bloqueado                                                                   | ✅ en local (Docker): candidato `relay`, `tls`, `turns:…:443`                                                                               | [`runbook.md`](../runbook.md#turn-y-redes-corporativas-e5-s8), `infra/livekit/turn-test` |
| Latencia de conexión A/V (RNF-02, p95 < 1,5 s)                                                               | En local la otra persona ve el vídeo 0,7–1,5 s después; en producción se mide en cada conversación (`media.peers_to_first_frame` en Sentry) | [informe del _spike_](../spikes/E0-S7-livekit.md)                                        |

## 5. Qué no se ha podido verificar aquí y cómo verificarlo

Este entorno no tiene credenciales de Google, VMs públicas, redes corporativas, GPU ni
navegadores distintos de Chromium. Todo lo de abajo está **preparado en el código y en la
documentación de operaciones**, pero hay que comprobarlo con medios reales. Orden recomendado:
5.1 → 5.2 → 5.3 → 5.4 → 5.5, y después invitar a los pilotos.

### 5.1 Google real: inicio de sesión (OIDC) y Google Meet

**Qué hace falta:**

- Un proyecto de Google Cloud por entorno (desarrollo, _staging_, beta) con la **Google Meet
  REST API** activada.
- Pantalla de consentimiento (modo _Testing_ con los usuarios piloto como usuarios de prueba, o
  _Internal_ si todos son del mismo Workspace) con los _scopes_ `openid`, `email`, `profile` y
  `https://www.googleapis.com/auth/meetings.space.created`.
- Un cliente OAuth «Aplicación web» con las URIs de redirección
  `https://<dominio>/api/auth/google/callback` y `https://<dominio>/api/auth/google/meet/callback`
  (en local, las de `http://localhost:5173`). Su **ID y secreto** van en `GOOGLE_CLIENT_ID` y
  `GOOGLE_CLIENT_SECRET` (instrucciones detalladas en `.env.example`).
- Dos cuentas de prueba: **una de Google Workspace** de un dominio de empresa y **una personal**
  (`@gmail.com`).

**Pasos:**

1. Con `AUTH_TEST_LOGIN=false`, entrar con la cuenta de Workspace: se vuelve a la ruta pedida,
   el nombre viene de Google y se puede cambiar; «Salir» cierra la sesión.
2. Cancelar la pantalla de Google: debe aparecer «Has cancelado…» y seguir en la entrada.
3. Crear un espacio con la cuenta de Workspace: Google pide permiso para crear reuniones y se
   crea **un Meet por sala** (se ve el enlace en Ajustes → Salas). Entrar en una sala del mapa y
   pulsar «Unirse a la reunión»: se abre ese Meet en una pestaña nueva.
4. Sustituir a mano el enlace de una sala en Ajustes: las personas dentro lo ven al momento.
5. Configurar el **dominio permitido** del espacio con el dominio de Workspace: la otra cuenta
   del mismo Workspace entra con `/s/<slug>` sin invitación; la cuenta **personal** no entra
   aunque su e-mail fuera de ese dominio (se usa el _claim_ `hd`, H-9).
6. Comprobar que Bululu no guarda _tokens_ de Google: en la base de datos no hay columnas de
   _access/refresh token_ (RNF-06).

### 5.2 Servidor de medios propio y TURN en una red corporativa

**Qué hace falta:**

- Una **VM de medios** de 4 vCPU con IP pública fija y ≥ 5 TB de tráfico al mes
  ([runbook, «Dimensionado»](../runbook.md#dimensionado-y-proveedor)); registros DNS
  `livekit.<dominio>` y `turn.<dominio>`; puertos TCP 443, UDP 443, UDP 50000–60000 y TCP 7881.
- Claves de LiveKit nuevas (`docker run --rm livekit/livekit-server:v1.9.12 generate-keys`) en
  `infra/livekit/.env` y en el `.env` de la app (`LIVEKIT_URL=wss://livekit.<dominio>`,
  `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) y `CSP_CONNECT_SRC` con ese dominio.
- Al menos **una red corporativa de un piloto** y el contacto de su área de TI (con la
  [guía de requisitos de red](../network-requirements.md)).

**Pasos:**

1. Desplegar según [`infra/livekit/README.md`](../../infra/livekit/README.md)
   (`render-config.sh`, `firewall.sh`, `docker compose up -d`).
2. Comprobar que LiveKit entrega sus _webhooks_ firmados a
   `https://<dominio>/api/media/livekit-webhook`: al conectarse alguien, en
   `docker compose logs server` de la VM de app aparecen peticiones `POST` a esa ruta con
   respuesta 2xx. De ellos dependen H-12 y H-13.
3. Desde _staging_, dos personas se acercan en el pasillo: se ven y se oyen; al entrar una en
   una sala, la otra deja de oírla al momento.
4. Desde la red del piloto: repetir el punto 3 y anotar en `chrome://webrtc-internals` el tipo de
   candidato elegido (`host`/`srflx` por UDP, `tcp` o `relay`). Si solo sale TCP 443, debe ser
   `relay` sobre `tls`. Registrar el resultado en la tabla del
   [runbook](../runbook.md#turn-y-redes-corporativas-e5-s8).
5. Repetir la prueba de medios de [`load-test.md`](../load-test.md) contra la VM
   real, con los clientes en otra máquina, y leer la CPU en el panel del proveedor.

### 5.3 60 fps en portátiles con GPU real (RNF-01)

Aquí solo hay Chromium con WebGL por software (8–9 fps con 3 navegadores y 47 _bots_, no
representativo). El test `world-performance.spec.ts` sí comprueba que el coste de JavaScript por
fotograma con 50 avatares queda muy por debajo del presupuesto de 16,7 ms.

**Qué hace falta:** el portátil de referencia (uno «medio» del equipo, con Chrome actual y
gráfica integrada), _staging_ desplegado y la prueba de carga de 5.4 en marcha.

**Pasos:** con 47 _bots_ caminando en un espacio de _staging_, abrir 3 pestañas o navegadores con
personas reales en ese espacio; en Chrome, DevTools → _Rendering_ → **Frame Rendering Stats**
(o el panel _Performance_ durante 30 s) mientras se camina y se habla. Objetivo: 60 fps estables.
Anotar el modelo del portátil, el navegador y el resultado en `docs/load-test.md`.

### 5.4 Prueba de carga de 15 minutos en _staging_

**Qué hace falta:** acceso SSH a la VM de _staging_, una base de datos aparte para la prueba
(el login de prueba nunca se activa en la app de verdad) y una máquina cliente fuera de la VM.

**Pasos** (detalle en [`load-test.md`](../load-test.md#1-tiempo-real-50-personas-moviéndose)):

1. En la VM de _staging_, arrancar la **imagen de producción** del servidor con el perfil de
   carga (`NODE_ENV=test`, `AUTH_TEST_LOGIN=true`, `RATE_LIMIT_PER_MINUTE=100000`,
   `HEALTH_TOKEN=<16+ caracteres>`, base de datos `bululu_load`, otro puerto) y limitarla a 2 CPU.
2. Desde la máquina cliente:
   `BULULU_HEALTH_TOKEN=<el mismo> pnpm --filter @bululu/load load --url https://<host de carga> --bots 50 --duration 900 --sample-every 30`
   (47 _bots_ si en paralelo se hace la medida de fps de 5.3).
3. Criterios: p95 de latencia de movimiento < 200 ms en cada intervalo, 0 errores y 0
   desconexiones, memoria sin crecimiento sostenido. Parar el contenedor y borrar su base de datos
   al terminar. Anotar fecha, versión y cifras en `load-test.md`.

### 5.5 Otras comprobaciones manuales

- **Navegadores (RNF-03):** los E2E automáticos solo usan Chromium. Pasar la lista de
  [`compatibilidad-navegadores.md`](../compatibilidad-navegadores.md) en las dos
  últimas versiones de Chrome, Edge, Firefox y Safari (incluye el permiso de notificaciones del
  _ring_ y los dispositivos reales).
- **Lectores de pantalla** (NVDA o JAWS en Windows, VoiceOver en macOS): los avisos de entrar y
  salir de una sala, los _toasts_ y los contadores del chat.
- **Suspensión real del portátil** con otra pestaña que toma el relevo, y reinicio real de la
  app contra un LiveKit que conserva estado (cubiertos solo con el proveedor falso y tests unitarios).
- **Los _workflows_ de GitHub en ejecución real:** CI en _pull requests_ y en `main`, despliegue a
  _staging_, etiqueta `v0.x.y` con aprobación y _rollback_ (necesita los _environments_ y secretos
  de 8.1).
- **Copias:** una restauración completa en la VM de beta siguiendo el
  [runbook](../runbook.md#copias-y-restauración-de-la-base-de-datos--e8-s5).

## 6. Limitaciones conocidas y riesgos aceptados

| Tema                                                 | Descripción                                                                                                                                                                                    | Decisión                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Salir de un espacio por decisión propia              | Un miembro no puede abandonar un espacio él mismo; solo la administración puede expulsarlo, o puede borrar su cuenta.                                                                          | Aplazado (necesita un cambio del protocolo en tiempo real). Se puede pedir a la administración. |
| Carrera al entrar                                    | Un cambio de estilo, escritorio o enlace de Meet que ocurra justo durante una entrada puede no llegar a esa persona hasta el siguiente cambio o la siguiente entrada.                          | Aceptado: poco probable, sin pérdida de datos.                                                  |
| Pestaña que vuelve a la red                          | Si la red vuelve durante los ~45 s en que el SDK de LiveKit aún reintenta solo, la pestaña antigua puede quitar un momento el audio/vídeo a la que se usa; esta lo recupera sola en ~1 s.      | Aceptado.                                                                                       |
| Plazas durante la reconexión                         | Durante los 30 s de gracia de una reconexión, esa persona sigue contando para el máximo de 50.                                                                                                 | Intencionado: quien se reconecta conserva su sitio.                                             |
| Entrada por dominio tras actualizar                  | La migración `20260927140000_user_hosted_domain` añade el dominio de Workspace (`hd`) a cada persona; quien entró antes debe volver a iniciar sesión para que funcione la entrada por dominio. | Aceptado (la beta aún no tiene usuarios).                                                       |
| Conversaciones de pasillo no privadas (RN-12, H-10)  | Un miembro con un cliente modificado podría suscribirse a pistas de pasillo de otras personas del espacio.                                                                                     | Aceptado por diseño y comunicado en la interfaz; la privacidad está en las salas (Meet).        |
| Protecciones que dependen de _webhooks_ (H-12, H-13) | Retirar el permiso de publicar a quien se conecta desde una sala y echar a quien perdió la membresía dependen de que LiveKit entregue sus _webhooks_.                                          | Verificar en la VM real (5.2).                                                                  |
| Duración de los E2E                                  | ~12 min en esta máquina compartida frente al objetivo de 10 min de E8-S4.                                                                                                                      | Aceptado; revisar en el CI de GitHub.                                                           |
| Tamaño del JavaScript                                | El _bundle_ de la web pesa ~1,6 MB + ~1,2 MB (Phaser, cargado aparte), ~0,8 MB comprimido en total.                                                                                            | Aceptado para la beta (se cachea); optimizable después.                                         |
| Navegadores                                          | Solo Chromium probado automáticamente.                                                                                                                                                         | Lista manual antes de los pilotos (5.5).                                                        |
| Operación                                            | Beta sin desplegar, sin prueba de restauración real, TURN sin validar en una red de piloto, 5 equipos piloto sin invitar.                                                                      | Pendiente de operaciones y producto ([`aceptacion-mvp.md`](../aceptacion-mvp.md)).              |

## 7. Cómo ejecutar la aplicación en local

Requisitos: Node.js 22, pnpm 10 (`corepack enable`) y Docker.

```bash
cp .env.example .env              # sin credenciales de Google se usa el login de prueba
pnpm install
pnpm infra:up:livekit             # PostgreSQL 16 + servidor de desarrollo de LiveKit
pnpm db:migrate                   # crea las tablas en bululu_dev
pnpm db:seed                      # opcional: usuario dev@bululu.local y espacio "oficina-demo"
pnpm dev                          # servidor en :3000, web en http://localhost:5173
```

Abrir `http://localhost:5173`, entrar con el login de prueba y crear un espacio. Para ver la
proximidad, abrir una segunda ventana de incógnito con otra persona y acercar los avatares.

Comprobaciones completas (las mismas de la §1):

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm validate:maps
pnpm test:e2e                     # Playwright; arranca su propio servidor (:3100) y web (:5174)
```

Más detalle (puertos ocupados, bases de datos de test, convenciones) en
[`README.md`](../../README.md).

## 8. Cómo desplegar la beta

La guía completa está en el [runbook](../runbook.md). Resumen:

### 8.1 Preparación (una vez por entorno: _staging_ y beta, con secretos distintos)

1. **VM de medios** (LiveKit + TURN): ver 5.2.
2. **VM de app** (2 vCPU / 4 GB, Ubuntu 24.04, Docker + Compose; TCP 80/443 y UDP 443 abiertos;
   DNS `bululu.<dominio>`), usuario de despliegue con la clave SSH del _workflow_ y carpeta
   `/opt/bululu`.
3. `/opt/bululu/.env` a partir de
   [`infra/app/.env.production.example`](../../infra/app/.env.production.example)
   (`chmod 600`): `SESSION_SECRET` y `HEALTH_TOKEN` nuevos, `POSTGRES_PASSWORD`,
   `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (5.1), `LIVEKIT_*` y `CSP_CONNECT_SRC` (5.2),
   `SENTRY_DSN`, `ADMIN_EMAILS` (quién ve el panel de métricas), `AUTH_TEST_LOGIN=false`,
   `COMPOSE_PROFILES=db`.
4. **GitHub → Settings → Environments:** `staging` (sin revisores) y `beta` (**revisores
   obligatorios**), con los secretos `APP_SSH_HOST`, `APP_SSH_USER`, `APP_SSH_KEY`,
   `APP_SSH_KNOWN_HOSTS` y reglas de ramas (`staging`: `main`; `beta`: `main` y `v0.*`); variable
   `VITE_SENTRY_DSN`; proteger las etiquetas `v0.*`.
5. **Sentry:** dos proyectos (Node.js y React) y sus DSN.

### 8.2 Publicar

1. Llevar la rama a `main` mediante _pull request_; el CI («Bululu CI») debe pasar.
2. Cada _merge_ en `main` con CI verde se despliega solo en **_staging_**. Allí, hacer 5.1–5.4.
3. Para la **beta**: `git tag v0.1.0 && git push origin v0.1.0` sobre un commit de `main` con CI
   verde → el _workflow_ «Bululu deploy» construye las imágenes, **espera la aprobación** del
   _environment_ `beta` y ejecuta `deploy.sh` en la VM (migraciones primero; si fallan, la versión
   anterior sigue sirviendo).
4. Comprobar: `curl -s https://<dominio>/api/health` devuelve `{"status":"ok","version":"v0.1.0"}`;
   entrar con dos personas (se ven, se oyen, el chat funciona); revisar Sentry.
5. Revertir si hace falta: «Run workflow» con la etiqueta anterior (runbook, «Revertir»).
6. Pilotos: enviar la [guía de bienvenida](../pilot-welcome.md) y la de red a su TI,
   hacer la prueba de red 5.2 con cada uno y seguir O1–O6 en `/admin/metricas`.

## 9. Documentos relacionados

- [`docs/aceptacion-mvp.md`](../aceptacion-mvp.md): criterios del brief §11 uno a uno.
- [`docs/runbook.md`](../runbook.md): despliegue, _rollback_, copias, claves, contingencias.
- [`docs/security-review.md`](../security-review.md): revisión de seguridad y privacidad.
- [`docs/load-test.md`](../load-test.md): método y resultados de la prueba de carga.
- [`docs/compatibilidad-navegadores.md`](../compatibilidad-navegadores.md): lista manual RNF-03.
- [`docs/network-requirements.md`](../network-requirements.md) y
  [`docs/pilot-welcome.md`](../pilot-welcome.md): para pilotos y su TI.
- [`04-plan-desarrollo.md`](./04-plan-desarrollo.md): plan y matriz de trazabilidad.
