# Compatibilidad de navegadores (RNF-03) — lista de comprobación manual

RNF-03 pide las dos últimas versiones de Chrome, Edge, Firefox y Safari. Los E2E automáticos
solo corren en Chromium; esta lista cubre lo que depende de APIs que cambian entre navegadores
(permisos de cámara y micrófono, `AudioContext`, notificaciones, `setSinkId`). Pasarla contra
_staging_ antes de invitar a los pilotos y después de cada actualización grande de LiveKit.

Dos personas, cada una en un navegador distinto; marcar ✅ / ❌ y anotar el problema.

| Paso                                                                                                          | Chrome | Edge | Firefox | Safari |
| ------------------------------------------------------------------------------------------------------------- | ------ | ---- | ------- | ------ |
| Entrar con Google y elegir avatar                                                                             |        |      |         |        |
| _Pre-join_: vista previa de la cámara, nivel del micrófono, elegir cámara y micrófono                         |        |      |         |        |
| _Pre-join_ con el permiso denegado: el mensaje explica cómo darlo; «Probar de nuevo» funciona                 |        |      |         |        |
| Pasillo: al acercarse se ven y se oyen; al alejarse se cortan                                                 |        |      |         |        |
| «Activar el sonido» si el navegador bloquea el audio hasta un clic                                            |        |      |         |        |
| Cambiar de altavoz durante la llamada (Firefox y Safari pueden no permitirlo: anotar qué ve la persona)       |        |      |         |        |
| Pestaña oculta: micro y cámara se apagan; al volver, se restauran                                             |        |      |         |        |
| Llamar: «Activar avisos de llamadas» pide el permiso; con la pestaña oculta llega la notificación y el sonido |        |      |         |        |
| Entrar en una sala: se cortan micro y cámara de Plaza; «Unirse a la reunión» abre Meet en otra pestaña        |        |      |         |        |
| Chat, reacciones y «Personas» (Localizar, Escritorio)                                                         |        |      |         |        |
| Corte de red de 10 s: «Reconectando…» y vuelta sola                                                           |        |      |         |        |

| Fecha | Versiones | Quién | Resultado |
| ----- | --------- | ----- | --------- |
|       |           |       |           |
