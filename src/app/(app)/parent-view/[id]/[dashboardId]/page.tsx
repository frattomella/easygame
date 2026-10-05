import { redirect } from "next/navigation";

export default function LegacyParentViewPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/parent-view/${params.id}`);
}
