---
name: jules-best-practices
description: Guía al agente en el uso eficiente de Jules dentro de Antigravity, asegurando flujos de trabajo coherentes y aplicación de mejores prácticas de IA.
---

# Jules Best Practices

## Cuándo usar este skill

- Cuando necesites delegar tareas de codificación compleja a Jules.
- Cuando se requiera optimizar el contexto enviado a la IA para evitar alucinaciones.
- Cuando desees integrar sugerencias de arquitectura de Jules en el flujo de Antigravity.

## Inputs necesarios

- **Contexto del Proyecto**: Archivos relevantes o fragmentos de código.
- **Objetivo**: Qué se espera que Jules resuelva (refactorización, fix, nueva feature).
- **Restricciones**: Reglas técnicas específicas del proyecto (ej: usar Tailwind, respetar tipos de TS).

## Workflow

1) **Definición de Contexto**: Seleccionar solo los archivos estrictamente necesarios y redactar un prompt con (Acción + Contexto + Formato de salida).
2) **Delegar a Jules (CLI)**: Usar la consola terminal con el comando CLI `jules new "tu prompt aquí"`. Jules detectará automáticamente el repositorio actual.
3) **Monitorear y Extraer (CLI)**: Revisar estado con `jules remote list --session` y absorber el código con `jules remote pull --session <ID> --apply`.
4) **Validación Cruzada**: Revisar que la propuesta de Jules (patch aplicado) no rompa las dependencias ni el modo offline de Antigravity.
5) **Implementación Iterativa**: Si hay errores, correr tests y refinar.

## Instrucciones

- **Precisión sobre cantidad**: No pidas a Jules "arreglar todo el archivo"; pide cambios en funciones específicas.
- **Manejo de Errores**: Si Jules devuelve código incompatible, usa la herramienta de logs de Antigravity para darle feedback inmediato a Jules.
- **Seguridad**: Nunca envíes tokens o secrets en los prompts de Jules.

## Output (formato exacto)

- Lista de cambios propuestos por Jules.
- Bloque de código listo para aplicar.
- Checklist de validación de mejores prácticas cumplidas.
