import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiDocsClient } from "./api-docs-client";
import {
  getSessionFromRequest,
  isPlatformAdminSession,
} from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "API interne EasyGame",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function InternalApiDocsPage() {
  const session = await getSessionFromRequest(
    new Request("http://easygame.local/private/api-docs", {
      headers: {
        cookie: cookies().toString(),
      },
    }),
  );

  if (!session) {
    redirect("/login");
  }

  if (!isPlatformAdminSession(session)) {
    redirect("/account");
  }

  return <ApiDocsClient />;
}
