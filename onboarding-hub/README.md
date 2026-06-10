# Onboarding Hub

An interactive, fully customizable onboarding portal for new joiners. Replace the static PowerPoint with a tech-feel hub: welcome video, 90-day plan, product showcase with charts, team gallery, values, and a customizable look (logo, colors, fonts) — all editable in a built-in admin CMS.

Built with **Next.js 14 (App Router)** + **TypeScript** + **Tailwind** + **Prisma** + **PostgreSQL**.

---

## 1 · Prerequisites

- Node.js 18.18+ (20+ recommended)
- A Postgres database. Easiest options:
  - **Local**: install Postgres, then `createdb onboarding_hub`
  - **Cloud**: [Neon](https://neon.tech), [Supabase](https://supabase.com), [Railway](https://railway.app) — paste the connection string into `.env`

## 2 · Setup

```bash
cd onboarding-hub
cp .env.example .env
# edit .env — set DATABASE_URL, AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npm run setup     # prisma generate + db push + seed
npm run dev
```

Open <http://localhost:3000>.

The default admin (from `.env`) is:
- **email:** `admin@example.com`
- **password:** `changeme`

Change these in `.env` before running `npm run setup`. Sign in at <http://localhost:3000/admin>.

## 3 · What's inside

### Public hub (`/`)
A dark, card-based dashboard:
- Hero with welcome message + embedded video (YouTube/Vimeo or any iframe URL)
- 6 navigable section cards (Welcome, First Week, Product & Platform, Engineering, Compliance, People & Culture)
- First-week progress card (shows required tasks)
- "Ask Anything" AI placeholder ready for your internal AI

### Section pages
- `/section/welcome`, `/section/first-week`, `/section/engineering`, `/section/compliance`, `/section/people` — item lists you fully control from the admin
- `/section/plan` — 90-day timeline with milestones and tasks
- `/section/products` — product cards with **interactive line charts** (recharts) and platform links
- `/section/team` — team gallery with photos
- `/section/values` — values grid with icons

### Admin CMS (`/admin`)
Logged-in admins get a sidebar with editors for:
- **Branding & theme** — company name, logo URL, favicon, color pickers for background/surface/border/text/primary/accent, font family, card radius. Changes apply instantly site-wide via CSS variables.
- **Welcome / hero** — title, message, video URL, CTA
- **Hub sections** — add/edit/delete the cards on the homepage; per-card title, slug, icon (lucide), and nested items
- **90-day plan** — milestones (with day-range labels) and tasks (marked required or optional)
- **Products** — name, description, link, image, and chart data (`"Jan:10,Feb:20"` or JSON)
- **Team** — name, role, photo URL, bio
- **Values** — title, description, icon

## 4 · Customization

### Colors and look
Everything visual is driven by CSS custom properties set from the `Branding` row. You don't need to touch CSS — change them in `/admin/branding`. The properties:

| CSS variable | What it controls |
| --- | --- |
| `--color-bg` | Page background |
| `--color-surface` | Card background |
| `--color-border` | Card borders, dividers |
| `--color-text` | Default text |
| `--color-muted` | Secondary text |
| `--color-primary` | Buttons, accents, chart lines |
| `--color-accent` | Secondary accent |
| `--font-sans` | Base font family |
| `--radius-card` | Card corner radius |

### Logo
Paste a public URL to your SVG or PNG logo in `/admin/branding`. Shown in the header and rendered into `<link rel="icon">` via the favicon URL.

### Icons
Pick any [lucide-react](https://lucide.dev/icons/) icon by name in the admin selectors (curated list in `lib/icon.tsx` — add more there if you want).

### Wiring up the "Ask Anything" AI
The card on the homepage is a placeholder. Open `components/AskAnythingCard.tsx` and replace it with a client component that calls your internal AI / RAG endpoint.

## 5 · Architecture

```
app/
  layout.tsx                    Injects branding as CSS vars on <html>
  page.tsx                      Hub homepage
  section/[key]/page.tsx        Section + special detail pages
  admin/
    login/page.tsx              Public login
    (protected)/                Auth-required route group
      layout.tsx                Sidebar shell
      page.tsx                  Overview
      branding/                 Theme editor
      welcome/                  Hero editor
      sections/                 Section + items editor
      plan/                     Milestones + tasks
      products/                 Products + chart data
      team/                     Team members
      values/                   Values
components/                     UI building blocks (Header, Hero, Cards, Chart)
lib/                            Prisma client, auth (jose), theme, icon helpers
prisma/
  schema.prisma                 Full data model
  seed.ts                       Demo data + admin user
```

All admin writes use [Next.js Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations) — no separate API layer, no client-side form handlers.

## 6 · Database

Run `npx prisma studio` (or `npm run db:studio`) for a GUI over the database.

To reset:
```bash
npx prisma migrate reset    # drops + reseeds
```

## 7 · Production

```bash
npm run build
npm start
```

Set `AUTH_SECRET` to a long random value in production (`openssl rand -base64 32`). Use a Postgres database with backups. The app is stateless apart from the database, so it deploys cleanly to Vercel, Fly, Render, or a single VM.

---

## Roadmap ideas

- Per-joiner accounts so progress is tracked individually (the 3/7 on the homepage)
- File uploads for images/videos (currently URL-based)
- Rich-text editor for section item bodies
- Multiple language support
- Calendar / 1:1 scheduling integration
