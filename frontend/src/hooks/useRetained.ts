import { useState } from "react";

/** Returns the latest non-null value, so closing dialogs can keep their content while fading out. */
export function useRetained<T>(value: T | null): T | null {
  const [kept, setKept] = useState<T | null>(value);
  if (value != null && value !== kept) setKept(value);
  return value ?? kept;
}
