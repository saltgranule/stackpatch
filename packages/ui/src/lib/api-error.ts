interface ApiErrorBody {
  error?: string;
  message?: string;
  statusCode?: number;
}

export function extractApiErrorMessage(
  body: ApiErrorBody | null,
  status: number,
  fallbackText?: string,
): string {
  if (body?.message && typeof body.statusCode === "number") {
    return body.message;
  }

  if (body?.error) {
    return body.error;
  }

  const trimmed = fallbackText?.trim();
  if (trimmed) {
    if (trimmed.startsWith("<")) {
      return `Request failed (${status})`;
    }
    return trimmed;
  }

  return `Request failed (${status})`;
}
