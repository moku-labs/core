import type { CreateContentInput } from "./types";

export type ValidationError = {
  field: string;
  message: string;
};

export const validateContent = (input: CreateContentInput): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!input.title || input.title.trim().length === 0) {
    errors.push({ field: "title", message: "Title is required" });
  }

  if (input.title && input.title.length > 200) {
    errors.push({
      field: "title",
      message: "Title must be 200 characters or less"
    });
  }

  if (!input.body || input.body.trim().length === 0) {
    errors.push({ field: "body", message: "Body is required" });
  }

  return errors;
};
