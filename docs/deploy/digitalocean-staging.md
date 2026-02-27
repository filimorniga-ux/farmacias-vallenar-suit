# Staging en DigitalOcean App Platform

## 1) Dependencias
Instalar `sharp` para runtime de Next.js fuera de Vercel:

```bash
npm install sharp
```

## 2) Build local del contenedor

```bash
docker build -t farmacias-vallenar:staging .
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e NEXT_IMAGE_UNOPTIMIZED=true \
  farmacias-vallenar:staging
```

## 3) Crear app de staging en DO

- Opción A (UI): Create App -> GitHub repo -> Dockerfile.
- Opción B (CLI):

```bash
doctl apps create --spec .do/app.staging.yaml
```

## 4) Variables obligatorias en DO

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `SENTRY_DSN` (si aplica)
- `SENTRY_AUTH_TOKEN` (solo build si subes sourcemaps)

## 5) Despliegues

```bash
doctl apps list
doctl apps create-deployment <APP_ID>
doctl apps logs <APP_ID> --type run
```

## 6) Recomendación inicial de costo/perf

- `apps-s-1vcpu-1gb`, `instance_count=1` para staging.
- Subir a `2` instancias solo al entrar a producción.
