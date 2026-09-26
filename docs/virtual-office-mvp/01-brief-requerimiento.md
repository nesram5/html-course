# 01 · Brief del requerimiento — Plaza MVP

| Campo | Valor |
|---|---|
| Producto | Plaza (nombre en clave) — oficina virtual 2D con vídeo por proximidad |
| Referencia | Gather Virtual Offices ([vídeo](https://youtu.be/zbllvQZRyh0), [análisis](./README.md#análisis-del-vídeo-de-referencia)) |
| Versión del documento | 1.0 |
| Alcance | Primera versión MVP (beta privada) |
| Stack obligatorio | TypeScript en frontend y backend |

---

## 1. Problema

Los equipos remotos e híbridos han perdido la **conversación espontánea** de la oficina.
Hoy, hablar con un compañero exige agendar una reunión o enviar un enlace de videollamada,
lo que genera:

- Aislamiento y poca visibilidad de quién está disponible.
- Exceso de reuniones formales para dudas de 2 minutos.
- Pérdida de cultura de equipo y de "pasillo".

## 2. Propuesta de valor

> "Entra a la oficina, mira quién está y **camina hasta él para hablar**. Sin enlaces, sin agendas."

Plaza ofrece un mapa 2D persistente donde cada persona es un avatar. Al acercar tu avatar al
de otra persona, el audio y el vídeo se conectan solos; al alejarte, se desconectan.
Las salas privadas funcionan como salas de reuniones reales.

## 3. Objetivos del MVP y métricas de éxito

| # | Objetivo | Métrica | Meta en la beta |
|---|----------|---------|-----------------|
| O1 | Validar que la conversación por proximidad es útil | Conversaciones espontáneas (≥ 2 personas conectadas > 30 s, sin sala privada) por usuario activo y día | ≥ 3 |
| O2 | Validar la retención de un equipo real | Equipos piloto que usan Plaza ≥ 3 días/semana durante 4 semanas | ≥ 3 de 5 equipos |
| O3 | Calidad técnica suficiente | Tiempo desde "entrar en proximidad" hasta oír/ver al otro (p95) | < 1,5 s |
| O4 | Estabilidad | Sesiones sin errores críticos (desconexión o pérdida de A/V no recuperada) | ≥ 98 % |
| O5 | Onboarding simple | Tiempo desde el enlace de invitación hasta estar dentro del mapa | < 60 s |

## 4. Usuarios y personas

| Persona | Descripción | Necesidad principal |
|---|---|---|
| **Ana — Administradora del espacio** | Responsable de equipo o de operaciones; crea la oficina | Crear el espacio en minutos, invitar al equipo y asignar escritorios |
| **Luis — Miembro del equipo** | Desarrollador o diseñador que trabaja en remoto | Ver quién está, hablar rápido sin agendar, poder concentrarse (estado "ocupado") |
| **Marta — Invitada** | Cliente o candidata que entra puntualmente | Entrar con un enlace, sin fricción, y encontrar la sala de reunión |

## 5. Alcance funcional del MVP (MoSCoW)

### 5.1 Must have — imprescindible para lanzar la beta

| ID | Requisito | Descripción |
|---|---|---|
| RF-01 | Registro e inicio de sesión | Email + contraseña. Cierre de sesión. Sesión persistente. |
| RF-02 | Perfil y avatar | Nombre visible y elección de avatar entre un catálogo de sprites predefinidos. |
| RF-03 | Crear espacio | Un usuario crea un espacio eligiendo una plantilla de mapa (mín. 2 plantillas). Se convierte en *owner*. |
| RF-04 | Invitar al espacio | Enlace de invitación con caducidad; al aceptarlo se entra como *member*. El *owner* puede revocar el enlace y expulsar miembros. |
| RF-05 | Mapa 2D | Renderizado del mapa por *tiles*, cámara que sigue al avatar propio, nombres sobre los avatares. |
| RF-06 | Movimiento | Flechas / WASD, movimiento por casillas con animación de caminar y colisiones con paredes y muebles. |
| RF-07 | Multijugador en tiempo real | Todas las personas conectadas al mismo espacio ven los movimientos de las demás con fluidez. |
| RF-08 | Audio/vídeo por proximidad | Si dos avatares están a ≤ *R* casillas (por defecto 3), su audio y vídeo se conectan automáticamente; al alejarse, el vídeo se desvanece y se desconectan. Quien está en una conversación muestra a los demás un globo 💬 sobre su avatar. |
| RF-09 | Controles de medios | Silenciar micrófono, apagar cámara, elegir dispositivos y **pantalla de prueba previa** (pre-join) con vista previa. |
| RF-10 | Áreas privadas | Zonas definidas en el mapa: quien está dentro solo oye/ve a quien está en la misma área, y nadie de fuera le oye. Al entrar se muestra el aviso "Has entrado en un espacio privado: <nombre>". |
| RF-11 | Compartir pantalla | Compartir pantalla con las personas conectadas en ese momento (proximidad o área privada), con vista ampliada para quien la recibe. |
| RF-12 | Presencia y estados | Estados *Disponible*, *Ocupado* (no molestar: no se conecta A/V por proximidad) y *Ausente*. El estado **"Fuera de la pestaña"** se activa solo al cambiar de ventana y **silencia automáticamente micro y cámara**; al volver se restauran. Indicador de color sobre el avatar y en la barra inferior. |
| RF-13 | Lista de miembros | Panel con miembros conectados/desconectados y botón **Localizar** (la cámara se mueve hasta la persona). |
| RF-14 | Chat de texto | Chat del espacio (todos) y chat cercano (quienes están conectados contigo). Se guardan los últimos 200 mensajes del espacio. |
| RF-15 | Reacciones | Emojis efímeros que aparecen sobre el avatar durante 3 s (visibles para todo el espacio). |
| RF-18 | Llamar (*ring*) | Botón "Llamar" en la tarjeta de alguien que está fuera de la pestaña o lejos (lista de miembros): le suena un aviso y una notificación del navegador "Sam te está llamando". |

### 5.2 Should have — si hay capacidad dentro del MVP

| ID | Requisito |
|---|---|
| RF-16 | Escritorios asignados: el *owner* asigna un escritorio a un miembro; al entrar, el avatar aparece en su escritorio y su nombre se ve sobre la mesa. |
| RF-17 | "Seguir" a una persona: tu avatar camina detrás de ella hasta que pulsas "Dejar de seguir" o te mueves. |
| RF-19 | Minimapa. |
| RF-20 | *Spotlight*: casillas especiales (tarima) desde las que quien habla se oye y se ve en **todo** el espacio (o en la zona definida), para anuncios y eventos. |
| RF-21 | Objetos interactivos: objetos del mapa que, al acercarse y pulsar `X`, abren contenido incrustado (web, vídeo, nota) configurado en el mapa. |

### 5.3 Won't have (en esta versión) — backlog post-MVP

Editor de mapas (tipo *Gather Studio*) · Grabación y transcripción · Notas con IA ·
Integración con calendario · Objetos interactivos editables por los usuarios (pizarras colaborativas) · Cambio de estilo del mapa en vivo · SSO y roles
avanzados · Apps móviles nativas · *Mini mode* · API pública · Facturación.

## 6. Reglas de negocio

| ID | Regla |
|---|---|
| RN-01 | La proximidad es **por pares**: A se conecta con B si la distancia euclídea entre sus casillas es ≤ *R*. No es transitiva (A–B y B–C no implica A–C). |
| RN-02 | Para evitar parpadeos, la desconexión ocurre a distancia > *R* + 1 (histéresis). |
| RN-03 | Si A está dentro de un área privada, A solo se conecta con quienes están en **la misma** área, sin importar la distancia. |
| RN-04 | Un usuario en estado *Ocupado* no se conecta por proximidad, pero **sí** dentro de un área privada (una reunión). |
| RN-05 | Al ocultar la pestaña, el estado pasa a *Fuera de la pestaña* y se silencian micro y cámara; al volver se restaura lo que había. Tras 10 min sin actividad de teclado/ratón pasa a *Ausente*. Cualquier interacción devuelve a *Disponible* (salvo que la persona eligiera *Ocupado*). |
| RN-06 | Máximo 50 personas conectadas simultáneamente por espacio en el MVP. |
| RN-07 | Máximo 12 personas en una misma conexión A/V (proximidad o área). Si se supera, se priorizan las 12 más cercanas / primeras en entrar al área. |
| RN-08 | Solo *owner* puede invitar, revocar invitaciones, expulsar y asignar escritorios en el MVP. |
| RN-09 | Nunca se graba audio ni vídeo. Los mensajes de chat se guardan (últimos 200 por espacio). |
| RN-10 | Cada usuario ocupa una casilla; dos avatares **sí** pueden compartir casilla (evita bloqueos en pasillos). |
| RN-11 | Quien está en una casilla *spotlight* se oye y se ve en todo el espacio (conexión **unidireccional**: el público no se oye entre sí por eso). No cuenta para el límite de RN-07. Máx. 3 personas en *spotlight* a la vez. |
| RN-12 | Solo se puede llamar (*ring*) a la misma persona una vez cada 30 s. |

## 7. Requisitos no funcionales

| ID | Categoría | Requisito |
|---|---|---|
| RNF-01 | Rendimiento | Latencia del movimiento de otros usuarios (emisión → render) p95 < 200 ms. Render a 60 fps en un portátil medio con 50 avatares. |
| RNF-02 | Rendimiento | Conexión A/V tras entrar en proximidad p95 < 1,5 s. |
| RNF-03 | Compatibilidad | Últimas 2 versiones de Chrome, Edge, Firefox y Safari de escritorio. Móvil fuera del alcance. |
| RNF-04 | Disponibilidad | 99 % mensual en la beta. Reconexión automática del socket y de los medios tras cortes < 30 s. |
| RNF-05 | Seguridad | HTTPS/WSS/DTLS-SRTP en todo. Contraseñas con Argon2id. Cookies `HttpOnly`, `Secure`, `SameSite=Lax`. Validación de toda entrada con esquemas. Rate limit en login y en eventos de socket. |
| RNF-06 | Privacidad | Cumplimiento GDPR: consentimiento de cámara/micrófono explícito, borrado de cuenta, sin grabaciones. La privacidad de las áreas privadas se **garantiza en el servidor**, no solo en el cliente. |
| RNF-07 | Accesibilidad | Navegación por teclado de toda la interfaz (no del mapa), contraste AA, textos alternativos, controles con `aria-label`. |
| RNF-08 | Observabilidad | Logs estructurados, métricas (usuarios conectados, latencia, errores de medios) y trazas de errores del cliente. |
| RNF-09 | Escalabilidad | Diseño preparado para escalar horizontalmente (estado de espacios detrás de una interfaz sustituible por Redis), aunque el MVP funcione en una sola instancia. |
| RNF-10 | Idioma | Interfaz en español, preparada para i18n (claves de traducción, sin textos incrustados). |

## 8. Flujos principales

1. **Primera vez (Ana):** registro → crear espacio → elegir plantilla → copiar enlace de invitación → entrar al mapa.
2. **Unirse (Luis/Marta):** abrir enlace → login/registro → elegir avatar → pre-join (cámara/mic) → aparecer en el mapa.
3. **Conversación espontánea:** caminar hacia alguien → a ≤ 3 casillas aparece su vídeo arriba → hablar → alejarse → se corta.
4. **Reunión:** entrar al área "Sala de reuniones" → se ve/oye a todos los de dentro → compartir pantalla → salir.
5. **Concentración:** poner estado *Ocupado* → los que pasan cerca no se conectan contigo.
6. **Llamar a quien no está atento:** su tarjeta muestra "Fuera de la pestaña" → pulsar *Llamar* → recibe aviso sonoro → vuelve a la pestaña y se reactivan sus medios.
7. **Anuncio a todos (Should):** subir a la tarima (*spotlight*) → todo el espacio te ve y te oye → el público reacciona con emojis.

## 9. Supuestos, restricciones y dependencias

- **Supuesto:** los equipos piloto usan portátiles con navegadores modernos y conexión ≥ 10 Mbps.
- **Restricción:** todo en TypeScript; infraestructura de medios de código abierto y *self-hosteable* (sin coste por minuto en la beta).
- **Dependencia:** servidor SFU de WebRTC (LiveKit, ver [ADR-003](./02-arquitectura.md#adr-003--medios-sfu-livekit-con-suscripción-controlada-por-el-servidor)) y servidor TURN para redes corporativas.
- **Dependencia:** mapas y sprites. En el MVP se usan *tilesets* con licencia libre (p. ej. CC0) y mapas creados en [Tiled](https://www.mapeditor.org/).

## 10. Riesgos principales

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Calidad A/V en redes corporativas (firewalls/UDP bloqueado) | Alto | TURN sobre TLS/443 incluido desde E5; prueba en redes reales en E8 |
| Consumo de CPU del navegador con muchos vídeos | Medio | Límite RN-07, simulcast y suscripción a calidad baja para miniaturas |
| Fuga de privacidad en áreas privadas | Alto | Suscripciones de medios decididas por el servidor (no por el cliente) |
| Alcance que crece (editor de mapas, integraciones) | Medio | MoSCoW estricto; todo lo nuevo va al backlog post-MVP |

## 11. Criterios de aceptación del MVP (Definition of Done del producto)

- [ ] Todos los requisitos **Must** (RF-01 a RF-15 y RF-18) implementados y con pruebas de aceptación.
- [ ] Prueba E2E de dos navegadores: se ven moverse, se conectan por proximidad y se desconectan al alejarse.
- [ ] Prueba de privacidad: un usuario fuera del área privada no recibe pistas de medios de quienes están dentro (verificado a nivel de servidor).
- [ ] Prueba de carga: 50 clientes simulados en un espacio con RNF-01 cumplido.
- [ ] Desplegado en un entorno de beta con HTTPS, TURN, monitorización y copias de seguridad.
- [ ] 5 equipos piloto invitados.

## 12. Glosario

| Término | Definición |
|---|---|
| Espacio | Una oficina virtual (un mapa + sus miembros). |
| Tile / casilla | Celda de la cuadrícula del mapa (32×32 px). |
| Proximidad | Conexión A/V automática entre avatares cercanos. |
| Área privada | Región del mapa que aísla la conversación de quienes están dentro. |
| SFU | *Selective Forwarding Unit*: servidor que reenvía pistas de audio/vídeo entre participantes. |
| Pre-join | Pantalla previa para probar cámara y micrófono antes de entrar. |
