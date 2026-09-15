import PagePlaceholder from "@/components/page-placeholder";

export const metadata = { title: "Bulk import" };

export default function ImportPage() {
  return (
    <PagePlaceholder
      title="Bulk import"
      description="Upload a CSV file to add many products at once and see which rows were imported or skipped."
    />
  );
}
