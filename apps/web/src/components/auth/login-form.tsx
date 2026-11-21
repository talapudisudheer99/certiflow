import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { FormError } from "@/components/auth/form-error";
import { SubmitButton } from "@/components/auth/submit-button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { listPeople, login, ROLE_LABEL, type Person } from "@/lib/people";
import { type LoginInput, loginSchema } from "@/lib/validations/auth";

// Old form: email + password. New form: pick a demo person (the brief says no passwords).
// Same pattern: React Hook Form + Zod + Field components + form-level error.
export function LoginForm({ onSignedIn }: { onSignedIn: (user: Person) => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [loadError, setLoadError] = useState<string>();

  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { userId: "" } });
  const { isSubmitting, errors } = form.formState;

  useEffect(() => {
    listPeople()
      .then((r) => setPeople(r.people))
      .catch(() => setLoadError("Cannot reach the server. Is the API running?"));
  }, []);

  async function onSubmit(values: LoginInput) {
    try {
      const { user } = await login(values.userId);
      onSignedIn(user);
    } catch (e) {
      form.setError("root", { message: e instanceof Error ? e.message : "Could not sign in" });
    }
  }

  const items = (people ?? []).map((p) => ({ value: p.id, label: `${p.name} (${ROLE_LABEL[p.role]})` }));

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Sign in as</CardTitle>
        <CardDescription>Demo mode: pick a person to try their part of the process.</CardDescription>
      </CardHeader>

      <CardContent>
        {loadError && <FormError message={loadError} />}
        {!loadError && !people && <Skeleton className="h-10 w-full" />}
        {people && (
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <Controller
                name="userId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="userId">Person</FieldLabel>
                    <Select items={items} value={field.value || null} onValueChange={(v) => field.onChange(v ?? "")}>
                      <SelectTrigger id="userId" className="w-full" onBlur={field.onBlur} aria-invalid={fieldState.invalid}>
                        <SelectValue placeholder="Choose a person" />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <FormError message={errors.root?.message} />
              <SubmitButton isSubmitting={isSubmitting} label="Continue" submittingLabel="Signing in..." />
            </FieldGroup>
          </form>
        )}
      </CardContent>

      <CardFooter className="justify-center text-sm text-muted-foreground">
        No password needed. The server checks what each person is allowed to do.
      </CardFooter>
    </Card>
  );
}
