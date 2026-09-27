# Bululu · Requisitos de red para el área de TI

Bululu es una oficina virtual que funciona en el navegador. Esta guía resume qué debe permitir la
red de su empresa para que funcionen el mapa, el chat y la **charla de pasillo** (audio y vídeo
entre personas cercanas en el mapa). Las reuniones de las salas usan Google Meet.

## Dominios y puertos a permitir (salida)

Sustituya `<dominio>` por el dominio de Bululu que le indiquemos.

| Destino                                          | Puerto y protocolo          | Para qué                                          | Imprescindible |
| ------------------------------------------------ | --------------------------- | ------------------------------------------------- | -------------- |
| `<dominio>` (la aplicación)                      | TCP 443 (HTTPS y WebSocket) | Web, API y tiempo real (posiciones, chat)         | Sí             |
| `livekit.<dominio>`                              | TCP 443 (WebSocket seguro)  | Señalización del audio y vídeo                    | Sí             |
| `turn.<dominio>`                                 | TCP 443 (TURN sobre TLS)    | Audio y vídeo cuando UDP está bloqueado           | Sí             |
| `turn.<dominio>`                                 | UDP 443                     | Audio y vídeo por TURN/UDP                        | Recomendado    |
| IP del servidor de medios (`livekit.<dominio>`)  | UDP 50000–60000             | Audio y vídeo directos (mejor calidad y latencia) | Recomendado    |
| IP del servidor de medios                        | TCP 7881                    | Audio y vídeo por TCP                             | Recomendado    |
| `accounts.google.com`, `*.googleusercontent.com` | TCP 443                     | Inicio de sesión con Google                       | Sí             |
| `meet.google.com` y dominios de Google Meet      | Según Google Meet           | Salas de reunión                                  | Sí (salas)     |

Con **solo TCP 443** abierto hacia los dominios anteriores, Bululu funciona: el audio y el vídeo
viajan por TURN sobre TLS en `turn.<dominio>:443`. Abrir además UDP mejora la latencia y reduce la
carga del servidor.

## Proxies e inspección TLS

- Si la red usa un proxy con **inspección TLS**, excluya `livekit.<dominio>` y `turn.<dominio>`:
  el tráfico TURN sobre TLS y los WebSocket de larga duración no sobreviven a la reinspección.
- Los WebSocket (`wss://`) deben poder mantenerse abiertos durante horas (la oficina está
  abierta toda la jornada). Evite cortes por inactividad por debajo de 60 s.

## Ancho de banda orientativo por persona

| Situación                                  | Bajada         | Subida         |
| ------------------------------------------ | -------------- | -------------- |
| En el mapa, sin conversación               | < 50 kbit/s    | < 50 kbit/s    |
| Conversación de pasillo con 2–3 personas   | 0,5–1,5 Mbit/s | 0,5–1,5 Mbit/s |
| Conversación con hasta 8 personas (máximo) | 1,5–3 Mbit/s   | 0,5–1,5 Mbit/s |

El vídeo se adapta a la red (varias calidades por persona) y solo se recibe el de las personas
cercanas.

## Puestos de trabajo

- Navegador actualizado: Chrome, Edge o Firefox (últimas dos versiones) o Safari 17+.
- Permiso para usar **cámara y micrófono** en `<dominio>` (se pide al entrar; si una política lo
  bloquea, se puede entrar sin medios, pero los demás no verán ni oirán a esa persona).
- Si se usan políticas de Chrome, no fije `WebRtcIPHandlingPolicy` en `disable_non_proxied_udp`
  salvo que también permita TCP 443 a `turn.<dominio>`.

## Cómo comprobarlo

Antes de invitar a su equipo haremos con ustedes una prueba: dos personas de su red entran en un
espacio de prueba, se acercan en el mapa y comprueban que se ven y se oyen. Si no funciona, les
pediremos el resultado de `chrome://webrtc-internals` para ver qué puerto está bloqueado.

Contacto técnico de Bululu: el que figure en su invitación al piloto.
