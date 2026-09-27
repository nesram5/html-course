# E0-S7 · Spike de LiveKit (proximidad) — resultado

El _spike_ desechable de E0-S7 **no se construyó como prototipo aparte**: sus preguntas se
contestaron con el código real de E5 y E6 y con pruebas automáticas contra el servidor de
desarrollo de LiveKit (`livekit-server --dev`). Este documento recoge lo que pedía la historia
(latencias, ancho de banda por persona y recomendación) y dónde está la evidencia.

| Pregunta del _spike_                                           | Respuesta                                                                                                                                                                                                                                                    | Evidencia                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| ¿Se puede suscribir solo a los _peers_ (proximidad selectiva)? | Sí: `autoSubscribe: false` y suscripción explícita a quien está en `media:peers`; el resto se desuscribe al momento                                                                                                                                          | `media-controller.test.ts`; E2E `hallway.spec.ts`                      |
| ¿Puede el servidor silenciar a alguien (salas, RNF-06)?        | Sí: `mutePublishedTrack` y revocar `canPublish`; el _webhook_ firmado lo repite si alguien se conecta después                                                                                                                                                | `meeting-room-media.int.test.ts` (LiveKit real), `livekit.int.test.ts` |
| Latencia de conexión                                           | De `media:peers` al primer fotograma del vídeo del otro: se mide en cada conversación real (`media.peers_to_first_frame` en Sentry, objetivo p95 < 1,5 s); en las pruebas locales de E6, la otra persona ve el vídeo 0,7–1,5 s después de volver de una sala | Sentry (_timing_), `docs/load-test.md`                                 |
| Ancho de banda por persona                                     | ~1,3 Mbps de salida del servidor de medios por persona en una conversación de 4 con vídeo (360p con _simulcast_); ~150 kbps por miniatura de 180p                                                                                                            | [`docs/load-test.md`](../load-test.md) («Medios del pasillo»)          |
| CPU del servidor de medios                                     | 12 conversaciones de 4 con vídeo: 10,5 % de una VM de 4 vCPU                                                                                                                                                                                                 | [`docs/load-test.md`](../load-test.md)                                 |

**Recomendación (ya aplicada):** LiveKit autoalojado en una VM de 4 vCPU con TURN/TLS
([`infra/livekit/`](../../infra/livekit/README.md)), con LiveKit Cloud como contingencia
([runbook](../runbook.md#contingencia-la-vm-de-medios-cae)).
