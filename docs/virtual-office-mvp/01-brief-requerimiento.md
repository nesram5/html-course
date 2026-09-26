# 01 · Brief del requerimiento — Plaza MVP

| Campo | Valor |
|---|---|
| Producto | Plaza (nombre en clave) — oficina virtual 2D con vídeo por proximidad |
| Referencia | Gather Virtual Offices ([vídeo](https://youtu.be/zbllvQZRyh0), [análisis](./README.md#análisis-del-vídeo-de-referencia)) |
| Versión del documento | 2.2 — alcance simplificado, servidor de medios propio y personalización de la oficina (ver [historial](./README.md#historial-de-versiones)) |
| Alcance | Primera versión MVP (beta privada) |
| Stack obligatorio | TypeScript en frontend y backend |
| Decisiones clave | Login solo con Google · Charla de pasillo con LiveKit (servidor propio en la beta) · Salas de reunión con Google Meet |

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
de otra persona, el audio y el vídeo se conectan solos **dentro del mapa**; al alejarte, se desconectan.
Para reuniones formales, cada sala del mapa tiene su propio **Google Meet** permanente: entras en la sala
y un clic te lleva a la reunión, con la pantalla compartida, la grabación y la transcripción de Meet.

**Principio del MVP:** construir solo lo que nos diferencia (el mapa y la charla espontánea) y
delegar en Google lo que ya resuelve muy bien (identidad y reuniones).

## 3. Objetivos del MVP y métricas de éxito

| # | Objetivo | Métrica | Meta en la beta |
|---|----------|---------|-----------------|
| O1 | Validar que la conversación por proximidad es útil | Conversaciones espontáneas (≥ 2 personas conectadas > 30 s en el pasillo) por usuario activo y día | ≥ 3 |
| O2 | Validar la retención de un equipo real | Equipos piloto que usan Plaza ≥ 3 días/semana durante 4 semanas | ≥ 3 de 5 equipos |
| O3 | Calidad técnica suficiente | Tiempo desde "entrar en proximidad" hasta oír/ver al otro (p95) | < 1,5 s |
| O4 | Estabilidad | Sesiones sin errores críticos (desconexión o pérdida de A/V no recuperada) | ≥ 98 % |
| O5 | Onboarding simple | Tiempo desde el enlace de invitación hasta estar dentro del mapa | < 30 s |
| O6 | Validar las salas con Meet | % de entradas a una sala que terminan en "Unirse a la reunión" | ≥ 70 % (si es menor, revisar [ADR-010](./02-arquitectura.md#adr-010--salas-de-reunión-con-google-meet)) |

## 4. Usuarios y personas

| Persona | Descripción | Necesidad principal |
|---|---|---|
| **Ana — Administradora del espacio** | Responsable de equipo; su empresa usa Google Workspace | Crear la oficina en minutos y que su equipo entre con su cuenta de Google |
| **Luis — Miembro del equipo** | Desarrollador que trabaja en remoto | Ver quién está, hablar rápido sin agendar, poder concentrarse (estado "ocupado") |
| **Marta — Invitada** | Cliente o candidata con una cuenta de Google | Entrar con un enlace y encontrar la sala de reunión |

## 5. Alcance funcional del MVP

### 5.1 Must have — el MVP completo

| ID | Requisito | Descripción |
|---|---|---|
| RF-01 | Login con Google | Inicio de sesión **solo** con cuenta de Google (OpenID Connect). Sin contraseñas. Cierre de sesión. Sesión persistente. |
| RF-02 | Perfil y avatar | Nombre visible (tomado de Google, editable) y elección de avatar entre un catálogo de sprites. |
| RF-03 | Crear espacio | Un usuario crea un espacio eligiendo una plantilla de mapa (mín. 2). Se convierte en *owner*. Al crearlo se genera un Google Meet permanente para cada sala de reunión del mapa. |
| RF-04 | Acceso al espacio | Un enlace de invitación por espacio, que el *owner* puede regenerar (el anterior deja de funcionar). Opcional: "cualquier persona con email de `@empresa.com` puede entrar". El *owner* puede expulsar miembros. |
| RF-05 | Mapa 2D | Renderizado por *tiles*, cámara que sigue al avatar propio, nombres sobre los avatares. |
| RF-06 | Movimiento | Flechas / WASD, movimiento por casillas con animación y colisiones con paredes y muebles. |
| RF-07 | Multijugador en tiempo real | Todas las personas del espacio ven los movimientos de las demás con fluidez. |
| RF-08 | Audio/vídeo por proximidad | En el pasillo (fuera de las salas), si dos avatares están a ≤ *R* casillas (por defecto 3), su audio y vídeo se conectan automáticamente y se ven sobre el mapa; al alejarse, el vídeo se desvanece y se desconecta. Quien conversa muestra un globo 💬 a los demás. |
| RF-09 | Controles de medios | Silenciar micrófono, apagar cámara, elegir dispositivos y **pantalla previa** (pre-join) con vista previa. |
| RF-10 | Salas de reunión con Google Meet | Áreas del mapa enlazadas a un Google Meet permanente. Al entrar: aviso "Estás en Sala 1", se corta el audio/vídeo del pasillo y aparece **"Unirse a la reunión"** (abre Meet en una pestaña nueva). Desde fuera se ve quién está dentro. El *owner* puede sustituir el enlace de Meet de una sala. |
| RF-11 | Estados | *Disponible*, *Ocupado* (no se conecta por proximidad) y *Ausente*. Al cambiar de pestaña se pasa a *Ausente* y se **silencian automáticamente** micro y cámara; al volver se restauran. |
| RF-12 | Lista de miembros | Panel con miembros conectados (estado y sala actual) y desconectados, con botón **Localizar**. |
| RF-13 | Chat del espacio | Chat de texto para todo el espacio; se guardan los últimos 100 mensajes. |
| RF-14 | Reacciones | Emojis efímeros sobre el avatar durante 3 s, visibles para todo el espacio. |
| RF-15 | Llamar (*ring*) | Botón "Llamar" en la tarjeta de alguien *Ausente* o lejano: le suena un aviso y una notificación del navegador. |
| RF-16 | Estilo de la oficina | El *owner* elige el estilo visual del espacio entre los de su plantilla (mín. 2: p. ej. *pixel art* y acuarela). El cambio se ve en directo para todos y no altera la distribución. |
| RF-17 | Mi escritorio | Cada miembro puede reclamar un escritorio libre (o el *owner* asignarlo). Su nombre aparece sobre la mesa, entra al espacio junto a él y tiene un botón "Mi escritorio" para volver. |
| RF-18 | Decorar mi escritorio | Cada persona coloca hasta 3 objetos de un catálogo (planta, lámpara, cuadro…) sobre su escritorio; todos los ven. |

### 5.2 Fuera del MVP — backlog post-MVP (priorizado)

1. Seguir a una persona · 2. *Spotlight* (hablar a todo el espacio) · 3. Objetos interactivos (web, vídeo, nota) ·
4. Compartir pantalla en el pasillo · 5. Chat cercano · 6. Mostrar quién está realmente conectado a cada Meet (API de Meet) ·
7. Minimapa · 8. Privacidad reforzada en el pasillo (permisos de suscripción) · 9. Editor de mapas (mover muebles, crear salas) · 10. Subir decoración propia ·
11. Otros proveedores de identidad (Microsoft) y SSO empresarial.

## 6. Reglas de negocio

| ID | Regla |
|---|---|
| RN-01 | La proximidad es **por pares**: A se conecta con B si la distancia euclídea entre sus casillas es ≤ *R*. No es transitiva. |
| RN-02 | Para evitar parpadeos, la desconexión ocurre a distancia > *R* + 1 (histéresis). |
| RN-03 | Quien está dentro de una **sala de reunión** no participa en la proximidad: ni oye el pasillo ni el pasillo le oye. Su conversación ocurre en Google Meet. |
| RN-04 | Un usuario *Ocupado* no se conecta por proximidad. |
| RN-05 | Pestaña oculta → *Ausente* con micro y cámara silenciados; al volver se restaura lo anterior. 10 min sin actividad → *Ausente*. Cualquier interacción devuelve al estado elegido (*Disponible* u *Ocupado*). |
| RN-06 | Máximo 50 personas conectadas por espacio. |
| RN-07 | Máximo 8 personas en una conversación de pasillo (se priorizan las más cercanas). Para grupos mayores, se usa una sala. |
| RN-08 | Solo el *owner* puede regenerar el enlace, configurar el dominio permitido, expulsar y cambiar los enlaces de Meet. |
| RN-09 | Plaza nunca graba audio ni vídeo. La grabación o transcripción en las salas depende de Google Meet y de la configuración de Workspace de cada empresa. |
| RN-10 | Dos avatares pueden compartir casilla (evita bloqueos en pasillos). |
| RN-11 | Solo se puede llamar (*ring*) a la misma persona una vez cada 30 s. |
| RN-12 | Las conversaciones de pasillo **no son privadas** (como en una oficina abierta). La privacidad se ofrece en las salas (Google Meet). Esto se comunica en la interfaz. |
| RN-13 | Una persona tiene como máximo un escritorio por espacio y un escritorio tiene como máximo un dueño. Si alguien sale del espacio o borra su cuenta, su escritorio queda libre. |
| RN-14 | Solo el *owner* cambia el estilo de la oficina y asigna o libera escritorios de otras personas; cada miembro puede reclamar uno libre y liberar el suyo. |
| RN-15 | La decoración solo usa objetos del catálogo (sin subir imágenes, para no necesitar moderación); máximo 3 por escritorio. |

## 7. Requisitos no funcionales

| ID | Categoría | Requisito |
|---|---|---|
| RNF-01 | Rendimiento | Latencia del movimiento de otros usuarios p95 < 200 ms. 60 fps en un portátil medio con 50 avatares. |
| RNF-02 | Rendimiento | Conexión A/V tras entrar en proximidad p95 < 1,5 s. |
| RNF-03 | Compatibilidad | Últimas 2 versiones de Chrome, Edge, Firefox y Safari de escritorio. |
| RNF-04 | Disponibilidad | 99 % mensual en la beta. Reconexión automática del socket y de los medios tras cortes < 30 s. |
| RNF-05 | Seguridad | HTTPS/WSS en todo. OAuth 2.0 con PKCE y `state`; verificación del `id_token`. Cookies `HttpOnly`, `Secure`, `SameSite=Lax`. Validación de toda entrada con esquemas. *Rate limit* en eventos de socket. |
| RNF-06 | Privacidad | GDPR: consentimiento de cámara/micrófono, borrado de cuenta, sin grabaciones en Plaza. Al entrar en una sala, el servidor **silencia** las pistas de pasillo de esa persona (no depende solo del cliente). Plaza no guarda *tokens* de Google. |
| RNF-07 | Accesibilidad | Navegación por teclado de toda la interfaz (no del mapa), contraste AA, `aria-label` en controles. |
| RNF-08 | Observabilidad | Logs estructurados y errores de cliente y servidor en Sentry. |
| RNF-09 | Mantenibilidad | Monolito modular; estado de espacios detrás de una interfaz sustituible; servicios externos (Google, LiveKit) detrás de adaptadores. |
| RNF-10 | Idioma | Interfaz en español, preparada para i18n. |

## 8. Flujos principales

1. **Primera vez (Ana):** "Entrar con Google" → crear espacio → elegir plantilla → autorizar la creación de salas de Meet → copiar enlace → entrar al mapa.
2. **Unirse (Luis/Marta):** abrir enlace → "Entrar con Google" → elegir avatar → pre-join → aparecer en el mapa (< 30 s).
3. **Conversación espontánea:** caminar hacia alguien → a ≤ 3 casillas aparece su vídeo sobre el mapa → hablar → alejarse → se corta.
4. **Reunión:** entrar en "Sala de reuniones" → aviso y corte del pasillo → "Unirse a la reunión" → Google Meet en otra pestaña (pantalla compartida, grabación, etc.) → volver al mapa y salir de la sala.
5. **Concentración:** estado *Ocupado* → quien pasa cerca no se conecta contigo.
6. **Llamar a quien no está atento:** tarjeta "Ausente" → *Llamar* → aviso sonoro → vuelve a la pestaña y se reactivan sus medios.
7. **Hacer la oficina propia:** Ana elige el estilo acuarela → todos lo ven cambiar → Luis reclama un escritorio junto a la ventana, pone una planta y una taza → al día siguiente entra directamente en su mesa.

## 9. Supuestos, restricciones y dependencias

- **Supuesto:** los equipos piloto usan **Google Workspace de pago**. Con cuentas gratuitas, las llamadas de Meet de 3 o más personas se cortan a los 60 min.
- **Restricción:** todo en TypeScript.
- **Dependencia — Google Cloud:** proyecto con pantalla de consentimiento OAuth y la API de Google Meet habilitada.
  El *scope* para crear salas (`meetings.space.created`) requiere **verificación de Google** si la app es "externa";
  en la beta se usa el modo de pruebas (hasta 100 usuarios) o se registra como app interna de cada Workspace piloto.
- **Dependencia — LiveKit:** servidor de medios de código abierto (sin licencia de pago) para la charla de pasillo.
  En desarrollo se usa el plan gratuito de LiveKit Cloud; en la beta, **LiveKit y TURN en una VM propia**
  (4 vCPU optimizada para cómputo, IP pública, tráfico incluido; ~20–40 US$/mes). Cambiar entre ambos no requiere tocar el código.
- **Dependencia — mapas y sprites:** *tilesets* con licencia libre (CC0) y mapas creados en [Tiled](https://www.mapeditor.org/).
- **Dependencia — arte de los estilos:** al menos un segundo estilo por plantilla (comprado con licencia comercial o encargado a un ilustrador). Si no llega a tiempo, se usan variantes de color del estilo por defecto ("Día", "Noche").
- **Restricción técnica:** Google Meet **no se puede incrustar** en otra web; las reuniones se abren en otra pestaña (ver [ADR-010](./02-arquitectura.md#adr-010--salas-de-reunión-con-google-meet)).

## 10. Riesgos principales

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El cambio de pestaña a Meet rompe la sensación de "estar en la oficina" | Medio | Métrica O6; al volver a Plaza, el avatar sigue en la sala. Plan B: reuniones dentro del mapa con LiveKit (post-MVP). |
| Verificación de Google para el *scope* de Meet | Medio | Modo de pruebas en la beta; alternativa sin *scope*: el *owner* pega un enlace de Meet por sala. |
| Dependencia de Google (identidad y reuniones) | Medio | Adaptadores en el código; identidad por `sub` de OIDC para poder añadir otros proveedores. |
| Operar el servidor de medios propio (caídas, certificados, TURN en redes corporativas) | Medio | TURN/TLS en 443 validado antes de invitar a pilotos; monitor de disponibilidad; contingencia: pasar a LiveKit Cloud cambiando variables. |
| Tráfico de red del servidor de medios | Bajo | Proveedor con tráfico incluido; alerta al 80 % del tráfico mensual. |
| Consumo de CPU con muchos vídeos | Medio | Límite RN-07 (8) y capa baja del simulcast para las miniaturas. |
| El arte de los estilos no llega a tiempo o su licencia no permite uso comercial | Medio | Encargarlo en el sprint 3; plan B con variantes de color; `validate:maps` exige declarar la licencia. |

## 11. Criterios de aceptación del MVP

- [ ] Requisitos RF-01 a RF-18 implementados y con pruebas de aceptación.
- [ ] Prueba E2E de dos navegadores: se ven moverse, se conectan por proximidad y se desconectan al alejarse.
- [ ] Prueba de salas: al entrar en una sala, el servidor silencia las pistas de pasillo de esa persona y nadie del pasillo la oye.
- [ ] Prueba de carga: 50 clientes simulados en un espacio con RNF-01 cumplido.
- [ ] Desplegado en la beta con HTTPS, monitorización de errores, copias de seguridad y servidor de medios propio con TURN validado en al menos una red corporativa.
- [ ] 5 equipos piloto invitados.

## 12. Glosario

| Término | Definición |
|---|---|
| Espacio | Una oficina virtual (un mapa + sus miembros). |
| Tile / casilla | Celda de la cuadrícula del mapa (32×32 px). |
| Pasillo | Cualquier zona del mapa que no es una sala de reunión. |
| Proximidad | Conexión A/V automática entre avatares cercanos en el pasillo. |
| Sala de reunión | Área del mapa enlazada a un Google Meet permanente. |
| Pre-join | Pantalla previa para probar cámara y micrófono antes de entrar. |
