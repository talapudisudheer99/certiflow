import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";

import { FormError } from "@/components/auth/form-error";
import { SubmitButton } from "@/components/auth/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { type CreateBatchInput, createBatchSchema } from "@/lib/validations/batch";

// Adapted from the old signup form (same Field + Controller + Zod pattern).
// US-3 will add the CSV file field; the POST /api/batches endpoint is not built yet.
export function CreateBatchForm({ onCreated }: { onCreated?: () => void }) {
  const form = useForm<CreateBatchInput>({
    resolver: zodResolver(createBatchSchema),
    defaultValues: { name: "", courseCode: "" },
  });
  const { isSubmitting, errors } = form.formState;

  async function onSubmit(values: CreateBatchInput) {
    try {
      await api("/batches", { method: "POST", body: JSON.stringify(values) });
      form.reset();
      onCreated?.();
    } catch (e) {
      form.setError("root", { message: e instanceof Error ? e.message : "Could not create the batch" });
    }
  }

  const fields = [
    { name: "name", label: "Batch name", placeholder: "Nov 2026 Tailoring batch A" },
    { name: "courseCode", label: "Course code", placeholder: "PSM-101", description: "Capital letters, numbers and dashes." },
  ] as const;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">New batch</CardTitle>
        <CardDescription>Create a batch, then upload its candidates.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            {fields.map(({ name, label, placeholder, ...rest }) => (
              <Controller
                key={name}
                name={name}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={name}>{label}</FieldLabel>
                    <Input {...field} id={name} placeholder={placeholder} aria-invalid={fieldState.invalid} />
                    {"description" in rest && !fieldState.invalid && <FieldDescription>{rest.description}</FieldDescription>}
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            ))}
            <FormError message={errors.root?.message} />
            <SubmitButton isSubmitting={isSubmitting} label="Create batch" submittingLabel="Creating..." />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
