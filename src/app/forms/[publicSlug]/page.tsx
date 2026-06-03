import { OnlinePublicForm } from "@/components/forms/OnlinePublicForm";

type PublicFormPageProps = {
  params: {
    publicSlug: string;
  };
};

export default function PublicFormPage({ params }: PublicFormPageProps) {
  return <OnlinePublicForm publicSlug={params.publicSlug} />;
}
