import AuthScreen from "@/components/AuthScreen";
import AuthForm from "@/components/AuthForm";

export default function SignUpPage() {
  return (
    <AuthScreen
      titleId="signup-title"
      title="Sign Up"
      subtitle="Create a tenant, owner user, and first business."
      footer={{ text: "Already registered?", link: "Login", href: "/login" }}
    >
      <AuthForm mode="signup" />
    </AuthScreen>
  );
}
