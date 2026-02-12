---
name: remotion-best-practices
description: Fuerza el uso de estándares de alto rendimiento en Remotion. Optimiza el renderizado, gestiona composiciones y asegura que el código sea escalable para videos complejos.
---

# Remotion Best Practices (Estándar de Producción)

## Cuándo usar este skill

- Al crear nuevas composiciones (`Composition`) o secuencias (`Sequence`).
- Al realizar optimizaciones de rendimiento en proyectos de video.
- Cuando el usuario pida ayuda con animaciones complejas o renderizado masivo.

## Reglas de Oro

1. **Composiciones Atómicas**: Divide el video en pequeñas composiciones reutilizables. No metas todo el video en un solo archivo.
2. **Uso de `useVideoConfig`**: Consume siempre las constantes (`width`, `height`, `fps`, `durationInFrames`) desde el hook `useVideoConfig()` en lugar de hardcodear valores.
3. **Animaciones con `interpolate`**: Prefiere la función `interpolate` de Remotion sobre cálculos manuales de interpolación para curvas de animación fluidas.
4. **Carga de Assets**: Usa `staticFile` para referencias a archivos en la carpeta `public`.
5. **Rendimiento**: Evita cálculos pesados dentro del ciclo de renderizado. Usa `useMemo` donde sea necesario.

## Instrucciones Técnicas

### 1. Estructura de Carpetas

```bash
src/
  components/     # Elementos visuales (Textos, Formas, Imágenes)
  compositions/   # Escenas completas
  utils/          # Lógica de animación
  Root.tsx        # Registro de composiciones
```

### 2. Animación Estándar

Usa `useCurrentFrame` y `spring` o `interpolate`:

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const opacity = interpolate(frame, [0, 20], [0, 1], {
  extrapolateRight: "clamp",
});
```

## Output Esperado

Cualquier componente de Remotion generado debe ser responsive al `config` de la composición y utilizar las utilidades nativas de Remotion para garantizar la sincronización perfecta de frames.
