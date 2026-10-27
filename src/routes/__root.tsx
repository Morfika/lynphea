import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { useSupabaseAuth } from "@/lib/auth";
import { catalogDefaultProducts, storageService } from "@/lib/store";
import { toast } from "sonner";
import {
  migrateLocalBusinessData,
  preloadBusinessData,
  seedDefaultBusinessProducts,
} from "@/lib/supabase-data";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl text-foreground">404</h1>
        <h2 className="mt-4 text-xl text-foreground">Página no encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          La página que buscas no existe o fue movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl tracking-tight text-foreground">Esta página no cargó</h1>
        <p className="mt-2 text-sm text-muted-foreground">Puedes reintentar o volver al inicio.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Reintentar
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LYNPHEA — Panel de gestión" },
      { name: "description", content: "Panel interno de LYNPHEA Makeup & Beauty." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Jost:wght@300;400;500&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const auth = useSupabaseAuth();
  const [dataReady, setDataReady] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataRetry, setDataRetry] = useState(0);
  const location = useLocation();
  const pathname = location.pathname;
  const publicRoute = pathname === "/" || pathname === "/catalogo" || pathname === "/login";
  const isFullScreenSheet =
    pathname.startsWith("/catalogo-atenea") ||
    pathname.startsWith("/compras/catalogo-atenea") ||
    pathname.startsWith("/catalogo-trendy") ||
    pathname.startsWith("/compras/catalogo-trendy");

  useEffect(() => {
    if (auth.ready && !auth.authenticated && !publicRoute) {
      window.location.replace("/login");
    }
  }, [auth.authenticated, auth.ready, publicRoute]);

  useEffect(() => {
    if (!auth.ready || !auth.authenticated) {
      setDataReady(false);
      setDataError(null);
      return;
    }

    let active = true;
    setDataReady(false);
    setDataError(null);
    void (async () => {
      try {
        storageService.ensureDefaultProducts();
        await migrateLocalBusinessData();
        await seedDefaultBusinessProducts(catalogDefaultProducts);
        await preloadBusinessData();
        if (active) setDataReady(true);
      } catch (error) {
        console.error("No se pudieron preparar los datos de Supabase:", error);
        if (active) {
          setDataError(error instanceof Error ? error.message : "Error inesperado de Supabase.");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [auth.authenticated, auth.ready, dataRetry]);

  return (
    <QueryClientProvider client={queryClient}>
      {publicRoute ? (
        <Outlet />
      ) : !auth.ready || !auth.authenticated ? null : dataError ? (
        <div className="flex min-h-screen items-center justify-center px-5">
          <div className="max-w-lg space-y-4 text-center">
            <h1 className="font-display text-3xl">No se pudieron cargar los datos</h1>
            <p className="text-sm text-muted-foreground">{dataError}</p>
            <button
              type="button"
              onClick={() => setDataRetry((retry) => retry + 1)}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              Reintentar
            </button>
          </div>
        </div>
      ) : !dataReady ? (
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          Sincronizando datos con Supabase…
        </div>
      ) : isFullScreenSheet ? (
        <div className="min-h-screen bg-background">
          <Outlet />
        </div>
      ) : (
        <AppShell
          onLogout={async () => {
            const { error } = await auth.signOut();
            if (error) {
              toast.error(`No se pudo cerrar la sesión: ${error}`);
              return;
            }
            window.location.replace("/login");
          }}
        >
          <Outlet />
        </AppShell>
      )}
      <Toaster />
    </QueryClientProvider>
  );
}
