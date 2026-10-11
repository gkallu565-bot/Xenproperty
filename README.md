# 🏡 XenProperty - AI-Powered Real Estate Ecosystem
> **"Smart Homes. Better Future. Where Property Meets Possibility."**

XenProperty is an end-to-end, full-stack real estate platform built using **Node.js, Express, SQLite, HTML5, CSS3, and JavaScript**. It closely matches the modern emerald aesthetic shown in the reference design, complete with an AI Matchmaker assistant, property listings, architectural studio, home loan calculator, and admin portal.

---

## 🚀 Quick Start (कैसे चलाएं)

This project has been set up with zero configuration needed. To start the server:

```bash
npm start
```

Then open your browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🔑 Demo Credentials (डेमो लॉगिन क्रेडेंशियल्स)

You can log in with the following pre-configured demo accounts or register your own new account:

- **Admin Account**:
  - **Email**: `admin@xenproperty.com`
  - **Password**: `admin123`
  - *Access*: Full admin dashboard (`/admin.html`), manage listings, view customer inquiries & loan applications.

- **User Account**:
  - **Email**: `rahul@xenproperty.com`
  - **Password**: `user123`
  - *Access*: Browse properties, schedule site visits, submit listings, apply for loans.

> ### ⚠️ SECURITY NOTICE — READ BEFORE DEPLOYING
>
> These credentials are **public**. This repository is public, and the same values
> are hard-coded in `public/js/auth.js` and `public/js/demo-store.js` because they
> power the one-click "Demo User" / "Demo Admin" buttons on the login page — so
> anyone can already download them from the deployed site.
>
> **Before using this for anything real:**
>
> 1. Change or delete the seeded admin account.
> 2. Remove the demo login buttons and the demo passwords from
>    `public/js/auth.js` and `public/js/demo-store.js`.
> 3. Set a real `JWT_SECRET` (see `DEPLOY.md`) — the server refuses to start in
>    production without one.
> 4. Set `ALLOWED_ORIGINS` so CORS is not open.
>
> The admin account can read every customer's name, email, phone number, loan
> amount and monthly income. Treat `admin123` as compromised.

---

## 🌟 Key Features & Pages

1. **Home Page (`index.html`)**:
   - Pixel-perfect recreation of the hero villa with floating AI cards (94% AI Match, Property Value ₹48.5L, Location Score 9.2/10).
   - Multi-tab search filter: `Buy` | `Rent` | `Commercial` with location, property type, budget, and Search/Ask AI buttons.
   - 6 Quick Action Cards (Buy Property, Rent Property, Sell Property, Interior Design, House Plans, Home Loans).
   - "Properties Worth Discovering" featured showcase (The Green Residency, Skyline Apartments, Royal Villa).
   - "A Smarter Way to Find Property" interactive AI chat assistant with live matching property cards.
   - 4-Step "Your Property Journey" timeline (Discover -> Buy/Rent -> Design -> Build).
   - "Imagine It Before You Build It" Design Studio showcase.
   - Home Loan financing assistance workflow with partner banks and trust indicators.
   - Comprehensive footer with links and social connections.

2. **Buy Marketplace (`buy.html`)**:
   - Filter properties for purchase across Bangalore, Mumbai, Hyderabad, Pune, Gurgaon.
   - Sort by Price, AI Match %, and Location rating.
   - Property detail modal with photo carousel, amenities list, and instant site visit booking.

3. **Rent Marketplace (`rent.html`)**:
   - Filter verified rental flats, studios, and penthouses.
   - Monthly budget sliders, furnishing status, and instant deposit estimations.

4. **Sell / List Property (`sell.html`)**:
   - Multi-step listing submission wizard for owners and agents.
   - Upload property photos or provide image URLs.
   - Auto-computes AI match score and immediately saves to SQLite database.

5. **Design & Architecture Studio (`design.html`)**:
   - Explore Interior Design, 2D Floor Plans, 3D House Designs, Elevation Designs, and Vastu consultation.
   - Interactive Design Cost Estimator based on area (sq.ft) and BHK configuration.
   - Online consultation request form.

6. **House Plans (`house-plans.html`)**:
   - Curated architectural floor plans with dimensions, room layouts, and Vastu compliance indicators.

7. **Home Loans (`loans.html`)**:
   - Interactive EMI & Eligibility Calculator with real-time sliders (Principal, Interest %, Tenure).
   - Bank comparison table (HDFC, SBI, ICICI, Axis).
   - 4-step online home loan application form.

8. **Services (`services.html`)**:
   - Legal Verification, Property Valuation, Vastu Consultation, Home Inspection, Packers & Movers.

9. **About Us (`about.html`)**:
   - The XenProperty story, AI ecosystem, leadership, and stats.

10. **Contact Us (`contact.html`)**:
    - Contact form, support hotline, and office locations across Bangalore, Mumbai, Delhi, Hyderabad.

11. **Login & Register (`login.html`)**:
    - Clean dual tab auth with 1-click demo login buttons.
    - Reached by pressing **List Property** while signed out. Signing in or
      registering then returns you to the listing form you were heading for.

12. **My Profile (`profile.html`)**:
    - Your account details, saved properties, your own listings, site visits, loan applications and design requests — in one place.
    - The navbar shows your name instead of any Login / Sign Up / Logout button; clicking it opens this page, which is also where you log out.
    - Edit your name and phone number in place. Email and role cannot be changed here.

13. **Admin Portal (`admin.html`)**:
    - Real-time platform KPI metrics, property management (view/delete), customer leads, and loan applications.

---

## 🧪 Testing

```bash
npm start            # terminal 1 - the app on http://localhost:3000
npm test             # 165 API/data assertions against the running server
npm run test:e2e     # Playwright in a headed browser (watch it run)
npm run test:e2e:demo  # same flows against the in-browser demo backend
npm run test:e2e:navbar  # the navbar sign-in / registration flow
```

The E2E suites drive a real Chromium: signing in, the profile page, editing
details, price sorting, the EMI calculator and small-screen layout. Any of them
accepts `--headless` for CI, and `BASE_URL=<url>` points them at a live deploy
instead of a local server. First run only:

```bash
npx playwright install chromium
```

`npm run check:encoding` scans the source for text that was once saved as
Windows-1252 and reports where a ₹, — or • got mangled. `npm run fix:encoding`
repairs it.

---

## 🗄️ Database
- Powered by **SQLite** (`xenproperty.sqlite`).
- Automatically initialized and seeded with verified luxury properties, test accounts, and sample inquiries.
- Zero external database installation or setup required.
