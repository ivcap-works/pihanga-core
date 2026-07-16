// src/components/lib/utils.ts
// Required by shadcn UI components — do not move or rename this file.
import {clsx, type ClassValue} from "clsx";
import {twMerge} from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
