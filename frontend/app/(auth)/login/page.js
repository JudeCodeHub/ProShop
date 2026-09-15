import PagePlaceholder from "@/components/page-placeholder";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <PagePlaceholder
      title="Sign in"
      description="Staff sign in with email and password. Cashiers go to the POS, admins go to the dashboard."
    />
  );
}
