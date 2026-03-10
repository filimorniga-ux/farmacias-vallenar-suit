# 🔐 Plan de Seguridad Final: Control de Acceso al Dominio

> **Dominio a proteger:** `farmaciasvallenarsuit.cl`  
> **Prioridad:** ÚLTIMA FASE — Ejecutar después de que el sistema esté estable en producción.  
> **Estado:** 📋 Planificado — No implementado.

---

## 🎯 Objetivo

Que solo personas y dispositivos **autorizados por el administrador** puedan siquiera VER la aplicación. Quien no tenga permiso, no ve nada — ni la pantalla de login, ni las sucursales, ni ninguna pantalla.

---

## 🔍 Diagnóstico del Problema

Hoy `farmaciasvallenarsuit.cl` es **público**: cualquier persona que conozca la URL puede:

- Ver la landing page y las sucursales disponibles
- Descargar los instaladores (Windows, Mac, Android)
- Intentar ataques de fuerza bruta al PIN
- Espiar la estructura del sistema

El PIN de usuario protege los datos, pero no protege la visibilidad del sistema.

---

## 🏆 Solución Recomendada: Cloudflare Zero Trust

**Costo:** Gratis para hasta 50 usuarios.  
**Código a modificar:** Ninguno. Es una capa externa.

### ¿Cómo funciona?

Cloudflare actúa como un **portero invisible** delante de Digital Ocean:

```text
Usuario           Cloudflare (portero)      Digital Ocean (servidor)
   │                     │                          │
   │── escribe URL ──▶   │                          │
   │                     │ ¿Estás autorizado?        │
   │◀── pantalla login ──│                          │
   │── ingresa email ──▶ │                          │
   │                     │ ✅ Sí, pasa              │
   │◀──────────────────────────────────────────────▶│
   │                     │                    app normal
```

### Flujo por tipo de usuario

| Situación | Resultado |
| --------- | --------- |
| Competidor o desconocido escribe la URL | Ve pantalla de Cloudflare — nunca llega a la app |
| Empleado autorizado en su tablet conocida | Entra directo, sin interrupciones (recordado 30 días) |
| Empleado en tablet nueva | Escribe email → código de 6 dígitos → entra → tablet recordada |
| Empleado despedido / revocado | Instantáneamente bloqueado en todos sus dispositivos |

---

## 📋 Plan de Implementación (4 Fases)

### Fase 1 — Mover DNS a Cloudflare *(~1–2 horas)*

> Verificar primero si el dominio `.cl` ya usa Cloudflare.

1. Crear cuenta gratuita en [cloudflare.com](https://cloudflare.com)
2. Agregar el dominio `farmaciasvallenarsuit.cl`
3. En NIC Chile (donde está registrado el `.cl`), cambiar los **nameservers** a los de Cloudflare
4. Confirmar que el registro `A` sigue apuntando a la IP de Digital Ocean
5. Esperar propagación DNS (hasta 24h, generalmente en minutos)

**Entregable:** Dominio en Cloudflare, app funcionando igual. ✅

---

### Fase 2 — Activar Cloudflare Zero Trust *(~1 hora)*

1. En panel Cloudflare → **Zero Trust** → Plan Gratuito (hasta 50 usuarios)
2. Crear una **Application** que proteja `farmaciasvallenarsuit.cl/*`
3. Configurar método de autenticación: **One-time PIN por email** (o Google/Microsoft)
4. Agregar lista de emails autorizados (un email por empleado)
5. Prueba: abrir navegador en modo incógnito → debe pedir autenticación

**Entregable:** Solo los emails de tu lista pueden entrar. ✅

---

### Fase 3 — Configurar experiencia para empleados *(~30 minutos)*

1. Primera vez: Cloudflare pide el email → llega código de 6 dígitos → ingresan
2. Cloudflare recuerda el dispositivo (configurable: 7, 30, 90 días)
3. La app Android (APK) también funciona: Cloudflare autentica el WebView una vez, luego recuerda la tablet
4. Comunicar a empleados el proceso de primer acceso

**Entregable:** Empleados autorizados entran fluidamente. ✅

---

### Fase 4 — Tuning avanzado *(Opcional, post-estabilización)*

| Ajuste | Detalle |
| ------ | ------- |
| Bloquear por país | Solo permitir acceso desde Chile |
| Device Posture | Verificar que el dispositivo tenga el SO actualizado |
| Alertas de intrusión | Notificación cuando alguien intenta entrar sin permiso |
| Branding personalizado | Pantalla de login con logo de Farmacias Vallenar |
| Excepción de rutas | Dejar `/landing` pública y proteger solo `/app` (para uso futuro) |

---

## ⚠️ Riesgos y Mitigación

| Riesgo | Mitigación |
| ------ | ---------- |
| Un empleado no tiene email | Crear Gmail gratuito por sucursal: `sucursalsantiago@gmail.com` |
| Cambio de DNS deja app caída | Hacer el cambio en horario de baja actividad. Cloudflare importa config actual automáticamente |
| 50 usuarios del plan gratis no alcanzan | Cloudflare Pro: $20 USD/mes → ilimitado. Con las 3 farmacias actuales alcanza de sobra |
| Digital Ocean + Cloudflare en conflicto | Solo importa que el registro `A` del DNS apunte a la IP de Digital Ocean. Estándar. |
| App Android no pasa la pantalla de Cloudflare | Probar en tablet antes de hacer el rollout. Si hay problema, hay opción de excluir el user-agent del APK |

---

## ✅ Checklist Final de Validación

- [ ] Modo incógnito en `farmaciasvallenarsuit.cl` muestra pantalla de Cloudflare, no la app
- [ ] Un email autorizado puede entrar sin problema desde cualquier dispositivo
- [ ] Al revocar un email, esa persona queda bloqueada en menos de 1 minuto
- [ ] La aplicación funciona exactamente igual para usuarios autorizados
- [ ] Logs de Cloudflare muestran accesos: quién, cuándo, desde qué IP/país
- [ ] La tablet Android con la app APK sigue funcionando después del cambio
- [ ] El APK se puede seguir descargando desde la landing (o se mantiene en GitHub Releases como alternativa)

---

## 💡 Alternativa más simple (si Cloudflare no está disponible)

**HTTP Basic Auth en nginx (Digital Ocean):**

- Una contraseña compartida para todo el equipo, configurada en el servidor
- Cualquier navegador pedirá usuario/contraseña antes de mostrar la app
- Menos granular (no por usuario) pero funciona sin servicios externos
- Tiempo de implementación: ~30 minutos

---

## 📁 Archivos a crear/modificar cuando se implemente

> ⚠️ **NO MODIFICAR AHORA**, solo para referencia futura.

- `nginx.conf` en Digital Ocean: agregar regla de autenticación (solo si se usa ruta alternativa)
- Cloudflare Dashboard: configuración externa, sin cambios en el repositorio

---

*Plan creado el 8 de marzo de 2026. Para implementar como última fase del proyecto.*
