import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Log in — Land record digitization",
};

/** Screen 1 in docs/04_Frontend_Spec.md. */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-navy">Land record digitization</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sign in to continue. Internal revenue staff only.
          </p>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
