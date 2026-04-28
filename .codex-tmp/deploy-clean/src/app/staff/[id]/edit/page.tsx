import { redirect } from "next/navigation";

export default async function StaffEditRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ clubId?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const clubId = resolvedSearchParams?.clubId;

  redirect(
    clubId
      ? `/staff/${resolvedParams.id}?clubId=${clubId}`
      : `/staff/${resolvedParams.id}`,
  );
}
