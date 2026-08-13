/** Feldfehler unter einem Eingabeelement, gespeist aus `ActionState.fieldErrors`. */
export function FieldErrors({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) {
    return null;
  }

  return <p className="mt-1 text-[12px] text-danger">{errors[0]}</p>;
}

/** Formularweiter Fehlerbanner, gespeist aus `ActionState.error`. */
export function FormErrorBanner({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p
      role="alert"
      className="rounded-[10px] border border-danger/20 bg-danger/5 px-3 py-2 text-[12.5px] text-danger"
    >
      {message}
    </p>
  );
}
