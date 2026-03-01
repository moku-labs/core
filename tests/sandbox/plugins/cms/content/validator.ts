import type { CreateContentInput } from "./types";

/**
 * A single validation failure for a specific field. Contains the field name
 * and a human-readable message. Used by `validateContent` and surfaced in
 * error messages by `content.create()`.
 */
export type ValidationError = {
  field: string;
  message: string;
};

/**
 * Validate `CreateContentInput` fields before content creation. Checks that
 * title and body are non-empty and that the title does not exceed 200
 * characters. Called by `content.create()` to enforce input constraints
 * before storing a new content item.
 *
 * @param {CreateContentInput} input - The content fields to validate.
 * @returns {ValidationError[]} An array of field-level errors (empty on success).
 */
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
