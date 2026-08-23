# DBL Repuestos

App interna para gestionar inventario, ventas, contabilidad y la integración
con Mercado Libre de DBL Repuestos (repuestos de moto).

Stack: React + Vite (SPA) · Supabase (base de datos, Auth, Storage) · Vercel
(hosting + funciones serverless en `/api` + cron).

## 1. Desarrollo local

```bash
npm install
npm run dev
```

Las variables de entorno del frontend ya están en `.env` (Supabase URL +
anon key del proyecto `dbl-repuestos`). Para que las funciones `/api`
funcionen en local hace falta correr con `vercel dev` en lugar de `vite dev`
(`npm i -g vercel`, después `vercel dev`), con las variables de
`.env.example` cargadas.

## 2. Crear tu usuario de acceso

La app no tiene registro público (es un panel interno de un solo negocio).
Para crear tu login: Supabase Dashboard → **Authentication → Users → Add
user** → cargá tu email y contraseña, marcá "Auto Confirm User". Con eso ya
podés entrar en `/login`.

## 3. Conectar Mercado Libre

1. Entrá a [developers.mercadolibre.com.ar](https://developers.mercadolibre.com.ar/)
   con tu cuenta de Mercado Libre y creá una aplicación nueva ("Mis
   aplicaciones" → "Crear aplicación").
2. Como **Redirect URI** poné: `https://<tu-dominio-vercel>/api/ml/callback`
   (tiene que ser HTTPS — no funciona con localhost).
3. Elegí los **topics de notificaciones** (webhooks): `orders_v2` y
   `questions`. La URL de notificaciones es:
   `https://<tu-dominio-vercel>/api/ml/webhook`.
4. Copiá el **Client ID** y **Client Secret** que te da ML.
5. En Vercel (Project → Settings → Environment Variables) cargá:
   - `ML_CLIENT_ID`
   - `ML_CLIENT_SECRET`
   - `ML_REDIRECT_URI` = la misma URL del paso 2
   - `CRON_SECRET` (opcional, cualquier string random) para proteger el
     endpoint de sincronización de métricas.
6. Redeployá. Entrá a **Configuración** dentro de la app y tocá "Conectar
   con Mercado Libre".

Una vez conectado:
- Los pedidos nuevos van a llegar solos a **Pedidos** (vía webhook).
- Para que un producto sume visitas/preguntas en **Estadísticas**, cargále
  el "ID publicación Mercado Libre" (ej. `MLA123456789`) desde **Inventario
  → Editar**. Ese ID es el que aparece en la URL de tu publicación.
- Las visitas se sincronizan solas cada 6 horas (`vercel.json` → cron). Las
  preguntas se actualizan en tiempo real por webhook.

## 4. Variables de entorno (Vercel)

Ver `.env.example`. Las que empiezan con `VITE_` van al bundle del cliente
(no son secretas). Las demás (`SUPABASE_SERVICE_ROLE_KEY`, `ML_CLIENT_SECRET`,
etc.) solo las usan las funciones `/api` y nunca deben llevar el prefijo
`VITE_`.

## 5. Estructura

```
src/pages/       páginas de la SPA (Inventario, Pedidos, Contabilidad, Estadísticas, Configuración)
src/lib/         cliente de Supabase, auth, formato
api/ml/          funciones serverless: OAuth, webhook de pedidos/preguntas, sync de métricas
schema.sql       esquema completo de Supabase (tablas + RLS + storage)
```
