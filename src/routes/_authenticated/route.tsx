import { createFileRoute, Outlet } from "@tanstack/react-router";

// Auth gate disabled — app is publicly accessible.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: () => <Outlet />,
});
