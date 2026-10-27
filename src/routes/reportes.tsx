import { createFileRoute, redirect, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/reportes")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => <Navigate to="/dashboard" replace />,
});
