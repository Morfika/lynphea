import { createFileRoute } from "@tanstack/react-router";
import { CatalogoPage } from "./catalogo";

export const Route = createFileRoute("/")({ component: CatalogoPage });
