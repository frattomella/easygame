import {
  SharedPageHeader,
  type SharedPageHeaderProps,
} from "@/components/dashboard/shared-page-header";

export function PageHeading(props: SharedPageHeaderProps) {
  return <SharedPageHeader {...props} />;
}
