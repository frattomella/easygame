import { AccessAreaGuard } from "@/components/auth/access-area-guard";

export default function AthleteProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccessAreaGuard>{children}</AccessAreaGuard>;
}
