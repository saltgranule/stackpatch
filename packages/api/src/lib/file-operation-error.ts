import { PathSecurityError } from "@stackpatch/shared";

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && typeof (error as NodeJS.ErrnoException).code === "string";
}

export function formatFileOperationError(error: unknown): string {
  if (error instanceof PathSecurityError) {
    return error.message;
  }

  if (isNodeError(error)) {
    switch (error.code) {
      case "ENOSPC":
        return "Not enough disk space to complete this operation";
      case "ENOMEM":
        return "Not enough memory to complete this operation";
      case "EACCES":
      case "EPERM":
        return "Permission denied while accessing files";
      case "EMFILE":
      case "ENFILE":
        return "Too many open files to complete this operation";
      default:
        break;
    }
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (/heap out of memory/i.test(message) || /allocation failed/i.test(message)) {
      return "The selection is too large to process. Try archiving a smaller folder or fewer items.";
    }
    if (message) {
      return message;
    }
  }

  return "File operation failed";
}
