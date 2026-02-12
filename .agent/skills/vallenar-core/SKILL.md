---
name: vallenar-core
description: Meta-Skill que activa TODO el contexto del proyecto: Idioma Español + Arquitectura Offline + Seguridad RBAC + Branding. Úsalo al iniciar sesión para cargar todas las reglas.
---
# Modo Farmacias Vallenar (Core Stack)

## Cuándo usar este skill

- **Al inicio de cada sesión de trabajo** en este proyecto.
- Cuando quieras asegurarte de que **todas** las reglas críticas (arquitectura, seguridad, diseño, idioma) estén activas simultáneamente.
- Para evitar tener que pedir cada skill por separado.

## Efecto de Activación

Al invocar este skill, **DEBES** leer y aplicar inmediatamente las reglas contenidas en los siguientes skills (en este orden de prioridad):

1. **Idioma y Comunicación**: `interaccion-espanol`
    - *Regla*: Todo (pensamiento, texto, docs) en ESPAÑOL.
    - [Referencia](.agent/skills/interaccion-espanol/SKILL.md)

2. **Seguridad Crítica**: `rbac-pin-security`
    - *Regla*: Cero login con email. PIN obligatorio. RBAC estricto.
    - [Referencia](.agent/skills/rbac-pin-security/SKILL.md)

3. **Arquitectura**: `arquitecto-offline`
    - *Regla*: Offline-first. Zustand > API. Clean Architecture.
    - [Referencia](.agent/skills/arquitecto-offline/SKILL.md)

4. **Diseño y Marca**: `estilo-marca`
    - *Regla*: Colores clínicos (Azul/Teal), tono directo, componentes consistentes.
    - [Referencia](.agent/skills/estilo-marca/SKILL.md)

5. **Calidad y Testing**: `qa-testing-enforcer`
    - *Regla*: Sin test no hay código (Unitario o E2E según corresponda).
    - [Referencia](.agent/skills/qa-testing-enforcer/SKILL.md)

6. **Precisión Financiera**: `financial-precision-math`
    - *Regla*: Prohibido flotantes para dinero. Enteros siempre.
    - [Referencia](.agent/skills/financial-precision-math/SKILL.md)

7. **UX Chilena**: `input-behavior-chile`
    - *Regla*: RUT con puntos, Moneda chilena, Inputs no bloqueantes.
    - [Referencia](.agent/skills/input-behavior-chile/SKILL.md)

8. **Zona Horaria**: `timezone-santiago`
    - *Regla*: America/Santiago para todo. Prohibido `new Date()` sin procesar.
    - [Referencia](.agent/skills/timezone-santiago/SKILL.md)

9. **Remotion**: `remotion-best-practices`
    - *Regla*: Animaciones fluidas, composiciones atómicas y alto rendimiento.
    - [Referencia](.agent/skills/remotion-best-practices/SKILL.md)

## Workflow de Razonamiento Unificado

Cada vez que recibas una instrucción bajo este modo, tu proceso mental debe ser:

1. **Filtro de Idioma**: "¿Estoy pensando en español?"
2. **Filtro de Seguridad**: "¿Esta acción toca dinero/stock? -> ¿Requiere PIN?"
3. **Filtro Financiero**: "¿Estoy calculando dinero? -> ¿Usé enteros?"
4. **Filtro de Arquitectura**: "¿Es esto UI? -> ¿Estoy usando Zustand en lugar de fetch?"
5. **Filtro de Calidad**: "¿He creado el test correspondiente?"
6. **Filtro de UX**: "¿Los inputs numéricos y RUTs funcionan fluido?"
7. **Filtro de Tiempo**: "¿Estoy usando la hora de Chile (Santiago)?"
8. **Filtro de Marca**: "¿Los colores y textos coinciden con Farmacias Vallenar?"
9. **Filtro de Video**: "¿Estoy optimizando el rendimiento de Remotion y usando composiciones atómicas?"

## Output Esperado

Cualquier código o respuesta generada bajo `vallenar-core` debe ser el resultado de la intersección de todas estas reglas. No se permite violar ninguna.

## Comando de Activación Rápida

El usuario activará esto diciendo algo como:
> "Activa el modo vallenar"
> "Carga los skills del proyecto"
