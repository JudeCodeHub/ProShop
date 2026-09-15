import LoginForm from "@/components/login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }) {
  const { next } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">ProShop POS</h1>
        <p className="text-sm text-slate-600">Sign in with your staff account</p>
      </div>
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </div>
  );
}
