"use client";
import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <main className="min-h-[70vh] flex items-start justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold text-center mb-4">Sign in</h1>
        <div className="rounded-2xl border p-4 flex items-center justify-center">
          <SignIn
            afterSignInUrl="/" 
            afterSignUpUrl="/"
            fallbackRedirectUrl="/"
            appearance={{ elements: { rootBox: "w-full" } }}
          />
        </div>
      </div>
    </main>
  );
}
