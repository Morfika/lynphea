# Supabase setup

## 1. Configure the local app

Copy `.env.example` to `.env.local` and replace the placeholders with the project's
**Project URL** and **publishable key** (or legacy `anon` key) from Supabase Project Settings.
Never put a `service_role` key in this frontend project.

Restart the Vite development server after changing environment variables.

## 2. Create the database objects

In the Supabase dashboard, open **SQL Editor** and run the migration files in
timestamp order:

1. `migrations/20261025000000_business_data.sql`
2. `migrations/20261025170000_product_images.sql`
3. `migrations/20261026110000_admin_product_search.sql`
4. `migrations/20261026120000_catalog_server_search.sql`

The migration creates row-level policies that restrict business records to their
authenticated owner. The public catalog view exposes only SKU, name, description,
line, and price; it does not expose internal cost or stock.
The public catalog only includes active products with stock greater than zero.
The product-image migration creates a public image bucket for catalog photos, with
authenticated uploads restricted to the owning account. The catalog owner can add,
reorder, and choose a cover image for each product.

## 3. Restrict accounts and sign in

Create the single administrator account in the Supabase dashboard. Then disable
public account creation under **Authentication → Settings → User Signups** (turn off
**Enable new user signups**). The application does not provide account creation.
To access the panel, enter `/login` manually and sign in with that administrator
account. The public catalog has no link to the login page.

## 4. First data synchronization

On the first authenticated session, the app imports this browser's existing
`lynphea:*` business data into the signed-in Supabase account in one transaction,
once per account. If that account already has business records in Supabase, the
local import is skipped to avoid overwriting remote data. Back up local data before
the first login.

After the import, business records are loaded from and saved to Supabase. Keep the
local `.env.local` file out of source control.

The administrator product list queries Supabase by page and applies SKU, name,
line, and supplier filters in the database. The app also inserts any missing
official catalog products without replacing existing product records.
The public home catalog at `/` also queries by page and searches SKU, name, and
description in Supabase; it loads product images only for the current page.

The first account that imports products becomes the public catalog owner. Other
accounts' product names, prices, and stock costs are not exposed through the public
catalog view.
