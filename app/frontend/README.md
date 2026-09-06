# Shadcn-UI Template Usage Instructions

## technology stack

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

All shadcn/ui components have been downloaded under `@/components/ui`.

## File Structure

- `index.html` - HTML entry point
- `vite.config.ts` - Vite configuration file
- `tailwind.config.ts` - Tailwind CSS configuration file
- `package.json` - NPM dependencies and scripts
- `src/main.tsx` - Project entry point
- `src/App.tsx` - Router shell (imports pages and sets up routes)
- `src/pages/Index.tsx` - Main page entry point for `/` by default; replace the placeholder page here unless you explicitly reroute `/` elsewhere
- `src/index.css` - Existing CSS configuration

## Components

- All shadcn/ui components are pre-downloaded and available at `@/components/ui`

## Styling

- Add global styles to `src/index.css` or create new CSS files as needed
- Use Tailwind classes for styling components

## Development

- Import components from `@/components/ui` in your React components
- Customize the UI by modifying the Tailwind configuration
- Do not stop after editing isolated components or only `src/App.tsx`. The default template homepage lives in `src/pages/Index.tsx`, and leaving `Welcome to Atoms` there means the app is still unfinished.
- Completion check: either replace `src/pages/Index.tsx` with your real homepage, or update the `/` route in `src/App.tsx` so the live homepage no longer renders the default placeholder page.

## Note

- The `@/` path alias points to the `src/` directory
- Do NOT modify the title, description, and logo in `index.html` — they are managed by the overview system via `data-mgx-overview` markers.

# Commands

**Install Dependencies**

```shell
pnpm i
```

**Start Preview**

```shell
pnpm run dev
```

**To build**

```shell
pnpm run build
```

## SparkForge deployment verification

Source edits alone do not prove that production serves a new frontend bundle. Build the frontend with `pnpm build`, verify that `dist/index.html` and `dist/blog/index.html` reference the generated assets, then publish and check the actual script filename and user flows in production. On 2026-09-06, the reviewed build entry is `index-Dt0JROIC.js`; model JSON syntax and schema validation share one bounded repair attempt.

The frontend retains non-streaming generation with a 180-second client timeout. Production streaming did not return headers within 30 seconds even with an immediate initial event; switching the frontend to SSE was reverted. Long builds still hit the platform 120-second proxy timeout. Backend authentication, output diagnostics, bounded token budget and optional SSE support remain. Resolve the platform streaming/long-request path before claiming end-to-end generation success.
