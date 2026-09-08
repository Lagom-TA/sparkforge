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

Run `pnpm typecheck`, `pnpm lint`, `pnpm test:review`, and `pnpm build` before publishing. Upload the reviewed source and built assets together, verify both dist HTML entry points, and check the actual production script hash after publication.

Generation uses `/api/v1/generation-jobs`: durable admission followed by bounded planning, AppSpec, and source steps. A model step has a 70-second total budget; the step route has an 85-second budget; the browser waits at most 95 seconds. A disconnected browser does not write failure over server state. Restore the saved task to resume unfinished steps. Closing all pages does not schedule future steps automatically.

Apply backend migration `20260908_generation_jobs` before enabling the new frontend. It creates the task metadata table and a unique project/version-number index without deleting existing versions. All generation and version writes now go through the task API, so deploy the backend and frontend together. Keep old assets for cached HTML during rollout.

Acceptance requires a real deployed plan → approval → build → cloud CRUD → refresh → share workflow. Local model stubs, type checks, or a successful platform build alone are insufficient. Downloaded template source is an independent demonstration; the platform preview runs the validated AppSpec against cloud records.

Reviewed release entry: `index-DtqG3V_t.js` (source commit `cab6618`).

Deployment HTML entrypoints are uploaded directly; verify the served script hash before release.

The source step now renders a deterministic React CRUD template from validated AppSpec, without an additional model request.
