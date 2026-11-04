import AuthScreen from "@/components/AuthScreen";
import AuthForm from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <AuthScreen
      titleId="login-title"
      title="Login"
      subtitle="Use your account to access the dashboard."
      footer={{ text: "Need an account?", link: "Create one", href: "/sign-up" }}
    >
      <AuthForm mode="login" />
    </AuthScreen>
  );
}
