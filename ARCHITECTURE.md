# XenProperty Architecture Documentation (सिस्टम आर्किटेक्चर दस्तावेज़)

## 1. Executive Overview (सिस्टम का संक्षिप्त विवरण)
**XenProperty** is India's premier AI-powered real estate ecosystem, connecting property buyers, tenants, sellers, architects, interior designers, and lending financial institutions into a unified digital experience.

---

## 2. Functional Architecture (कार्यात्मक संरचना)

### 2.1 Core Modules & Workflows
1. **Property Discovery & Multi-Tab Filter**:
   - Tab switching: `Buy`, `Rent`, `Commercial`.
   - Dynamic parameter filtration: City (Bangalore, Mumbai, Hyderabad, Pune, Gurgaon, etc.), Property Type (Villa, Apartment, Penthouse, Studio, Commercial), and Budget range.
   - Real-time search query matching against title, location, description, and amenities.

2. **A Smarter Way to Find Property (AI Matchmaker Engine)**:
   - Natural language processing extracts search criteria (budget, bedrooms, location, amenities).
   - Generates contextual friendly AI messages and calculates an AI Match Score (%), Location Score, and Lifestyle Score for each recommended property.

3. **Property Listing & Management ("+ List Property")**:
   - Comprehensive form allowing users to submit new residential or commercial properties.
   - Handles image upload (via Multer) or URL input, auto-formats price in Lakhs/Crores/monthly rent, calculates initial AI match and location scores, and saves to SQLite database.

4. **Property Details & Site Visit Booking**:
   - In-depth modal with image galleries, price badges, amenity chips, carpet area, furnishing details, and map mockups.
   - Interactive visit scheduling with date, time, and visit type (In-person vs. Virtual video tour).

5. **Design & Architecture Studio ("Imagine It Before You Build It")**:
   - 5 specialized services: Interior Design, 2D Floor Plans, 3D House Designs, Elevation Designs, and Vastu Plans.
   - Interactive design cost estimator and consultation request booking.

6. **House Plans Catalog**:
   - Pre-engineered 2D and 3D architectural floor plans categorized by BHK and plot dimensions.

7. **Home Loans Hub ("Financing Assistance")**:
   - Dynamic EMI calculator with loan amount, interest rate %, and tenure sliders.
   - Bank comparison table (HDFC, SBI, ICICI, Axis, Kotak).
   - 4-step streamlined online loan application.

8. **Admin & Management Portal**:
   - Live metrics: Total properties, users, leads/inquiries, loan applications, and design requests.
   - Property listing management (view, delete, preview).

---

## 3. Non-Functional Architecture (गैर-कार्यात्मक संरचना)

1. **User Experience & Aesthetic Luxury**:
   - Matches the reference design with deep forest emerald green (`#0F5B46`), clean white cards, subtle borders (`#E7ECE9`), pill buttons, and modern glassmorphic hero elements.
2. **Device Responsiveness**:
   - Fully responsive grid and flexbox layout across mobile (320px+), tablet (768px+), laptop (1024px+), and 4K desktop screens.
3. **Performance & Lightweight Footprint**:
   - Pure Vanilla ES6+ JavaScript and modern CSS3 without bulky frameworks, ensuring ultra-fast load times (<300ms).
4. **Data Reliability & Zero Configuration**:
   - SQLite embedded database (`xenproperty.sqlite`) requires no external MySQL/PostgreSQL server setup. Runs out-of-the-box upon `npm start`.
5. **Security**:
   - Passwords hashed using `bcryptjs` with salt rounds = 10.
   - JWT authentication for protected operations.
   - Parameterized SQL queries to eliminate SQL injection vulnerabilities.

---

## 4. Conceptual Architecture (वैचारिक संरचना)

```
+-----------------------------------------------------------------------+
|                           CLIENT LAYER                                |
|   HTML5 + CSS3 (Glassmorphism / Design System) + Vanilla JS (ES6+)    |
|   Pages: Home, Buy, Rent, Sell, Design, House Plans, Loans, Services  |
|          About, Contact, Login, Admin Dashboard                       |
+-----------------------------------+-----------------------------------+
                                    | HTTP / REST API (JSON)
                                    v
+-----------------------------------------------------------------------+
|                      BACKEND APPLICATION SERVER                       |
|                          Node.js + Express.js                         |
|   - Router & Middleware (CORS, Multer file upload, JWT Auth)          |
|   - Controller & NLP Matchmaker Services                              |
+-----------------------------------+-----------------------------------+
                                    | SQL Queries (dbRun, dbAll, dbGet)
                                    v
+-----------------------------------------------------------------------+
|                        DATA PERSISTENCE LAYER                         |
|                      SQLite (xenproperty.sqlite)                      |
|   Tables: users, properties, inquiries, loan_applications,            |
|           design_requests                                             |
+-----------------------------------------------------------------------+
```

---

## 5. Logical Architecture & Database Schema (तार्किक संरचना एवं स्कीमा)

### 5.1 Tables Definition
1. **users**: `id`, `full_name`, `email`, `password_hash`, `phone`, `role`, `avatar`, `created_at`
2. **properties**: `id`, `user_id`, `title`, `listing_type`, `property_type`, `price`, `price_display`, `city`, `state`, `address`, `beds`, `baths`, `area_sqft`, `image_url`, `additional_images`, `ai_match_pct`, `location_score`, `lifestyle_score`, `description`, `amenities`, `furnishing`, `is_verified`, `is_featured`, `created_at`
3. **inquiries**: `id`, `property_id`, `property_title`, `user_name`, `user_email`, `user_phone`, `visit_date`, `visit_time`, `visit_type`, `message`, `status`, `created_at`
4. **loan_applications**: `id`, `full_name`, `email`, `phone`, `loan_amount`, `monthly_income`, `property_city`, `employment_type`, `bank_preference`, `status`, `created_at`
5. **design_requests**: `id`, `full_name`, `email`, `phone`, `service_type`, `property_area`, `budget_range`, `message`, `status`, `created_at`

---

## 6. REST API Endpoints Catalog

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register new user / agent / admin |
| `POST` | `/api/auth/login` | Login and receive JWT token |
| `GET` | `/api/auth/me` | Fetch authenticated user profile |
| `GET` | `/api/properties` | Dynamic filter & search properties |
| `GET` | `/api/properties/featured` | Fetch featured properties for homepage |
| `GET` | `/api/properties/:id` | Fetch single property detail |
| `POST` | `/api/properties` | Create new listing (with image upload) |
| `DELETE` | `/api/properties/:id` | Remove property listing |
| `POST` | `/api/ai/chat` | AI Conversational Search & Matchmaker |
| `POST` | `/api/inquiries` | Submit site visit or property lead |
| `GET` | `/api/inquiries` | Fetch inquiries list (Admin) |
| `POST` | `/api/loans/apply` | Submit loan financing application |
| `GET` | `/api/loans` | List loan applications (Admin) |
| `POST` | `/api/design/request` | Submit architecture/design inquiry |
| `GET` | `/api/design/requests` | List design requests (Admin) |
| `GET` | `/api/admin/stats` | System KPI metrics |

---

## 7. How to Run (एप्लीकेशन चलाने का तरीका)

1. Open terminal in project folder `c:\Users\gkall\Desktop\kk`
2. Run command:
   ```bash
   npm start
   ```
3. Open your browser at:
   ```
   http://localhost:3000
   ```
