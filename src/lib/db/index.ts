import "@tanstack/react-start/server-only";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { getD1 } from "@/utils/env";

export const db = drizzle(getD1(), { schema });
