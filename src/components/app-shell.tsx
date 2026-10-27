import { Link } from "@tanstack/react-router";
import {
  Home,
  ShoppingBag,
  Boxes,
  Sparkles,
  Truck,
  Users,
  Receipt,
  CalendarDays,
  Settings,
  Menu,
  LogOut,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/ventas", label: "Ventas", icon: ShoppingBag },
  { to: "/inventario", label: "Inventario", icon: Boxes },
  { to: "/productos", label: "Productos", icon: Sparkles },
  { to: "/compras", label: "Compras", icon: Truck },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/gastos", label: "Gastos", icon: Receipt },
  { to: "/periodos", label: "Periodos", icon: CalendarDays },
] as const;

function Brand() {
  return (
    <div className="px-6 py-8">
      <p className="font-display text-3xl leading-none tracking-[0.22em] text-foreground">
        LYNPHEA
      </p>
      <p className="mt-2 label-caps">Makeup • Beauty</p>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {nav.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          activeOptions={{ exact: item.to === "/dashboard" }}
          className="group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-blush/60 hover:text-foreground data-[status=active]:bg-blush data-[status=active]:text-foreground"
        >
          <item.icon className="h-4 w-4 text-rose" strokeWidth={1.5} />
          <span className="tracking-wide">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

function SidebarInner({
  onNavigate,
  onLogout,
}: {
  onNavigate?: (() => void) | undefined;
  onLogout: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <Brand />
      <div className="mx-6 h-px bg-border" />
      <div className="mt-6 flex-1">
        <NavList onNavigate={onNavigate} />
      </div>
      <div className="border-t border-border p-3">
        <Link
          to="/configuracion"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-blush/60 hover:text-foreground data-[status=active]:bg-blush data-[status=active]:text-foreground"
        >
          <Settings className="h-4 w-4 text-rose" strokeWidth={1.5} />
          <span className="tracking-wide">Configuración</span>
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-blush/60 hover:text-foreground"
        >
          <LogOut className="h-4 w-4 text-rose" strokeWidth={1.5} />
          <span className="tracking-wide">Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar lg:block">
        <div className="sticky top-0 h-screen">
          <SidebarInner onLogout={onLogout} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="rounded-md border border-border p-2">
              <Menu className="h-4 w-4" strokeWidth={1.5} />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SidebarInner onNavigate={() => setOpen(false)} onLogout={onLogout} />
            </SheetContent>
          </Sheet>
          <div>
            <p className="font-display text-xl leading-none tracking-[0.2em]">LYNPHEA</p>
            <p className="mt-1 label-caps">Makeup • Beauty</p>
          </div>
        </header>

        <main className="flex-1 px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
