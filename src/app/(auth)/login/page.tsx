import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Log in — Land record digitization",
};

/** Screen 1 in docs/04_Frontend_Spec.md. */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <Card className="w-full max-w-sm border-hairline bg-field shadow-none">
        <CardHeader>
          <CardTitle className="font-serif text-xl font-medium text-navy">
            Land record digitization
          </CardTitle>
          <div className="mt-1 h-[2px] w-10 bg-terracotta" />
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
