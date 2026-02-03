---
name: interaccion-espanol
description: Fuerza que todo el razonamiento, respuestas, tareas y documentos generados por el agente sean siempre en español.
---
# Interacción Completa en Español

## Cuándo usar este skill
- Siempre que inicies una conversación con Antigravity.
- Cuando necesites garantizar que no se mezcle inglés en los razonamientos internos (`thought`), outputs, tareas (`task.md`) o explicaciones.
- Para mantener consistencia total en el idioma del proyecto.

## Inputs necesarios
No requiere inputs adicionales, se aplica globalmente al contexto de la sesión.

## Reglas de Idioma (Estrictas)
1.  **Razonamiento (Thought)**: Debe ser 100% en español. Explica tus decisiones internamente en español.
2.  **Respuestas (Chat)**: Dirígete al usuario siempre en español.
3.  **Artefactos**:
    - `task.md`: Títulos, descripciones y estados en español.
    - `implementation_plan.md`: Todo el contenido, headers y explicaciones en español.
    - `walkthrough.md`: Guías y resúmenes en español.
4.  **Excepciones Técnicas**: Los nombres de variables, funciones, rutas de archivo o comandos de terminal (`git`, `ls`, `npm`) se mantienen en su idioma original (inglés técnico), pero la explicación sobre ellos debe ser en español.

## Workflow
1.  **Analizar**: Lee el prompt del usuario en español.
2.  **Pensar**: Genera el bloque de pensamiento (`thought`) en español explicando qué vas a hacer.
3.  **Ejecutar**: Realiza las acciones técnicas necesarias.
4.  **Documentar**: Si creas o actualizas artefactos, hazlo en español.
5.  **Responder**: Informa al usuario en español.

## Output Esperado
- Todas las interacciones, textos visibles y pensamientos internos deben estar en español.
- Documentos claros y bien redactados en español neutro o acorde al tono del proyecto.
