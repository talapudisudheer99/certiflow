import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";

type SubmitButtonProps = {
  isSubmitting: boolean;
  label: string;
  submittingLabel: string;
};

export function SubmitButton({ isSubmitting, label, submittingLabel }: SubmitButtonProps) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
      {isSubmitting && <Loader2Icon className="animate-spin" aria-hidden />}
      {isSubmitting ? submittingLabel : label}
    </Button>
  );
}
