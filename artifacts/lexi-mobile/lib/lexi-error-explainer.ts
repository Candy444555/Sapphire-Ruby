type ErrorDetails = { title: string; why: string; fix: string[] };

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "An unknown error occurred";
}

function matchError(rawMessage: string): ErrorDetails {
  const message = rawMessage.toLowerCase();

  if (message.includes("hf_token") || message.includes("hugging face") || message.includes("unauthorized") || message.includes("401")) {
    return {
      title: "Lexi could not authenticate with the AI provider.",
      why: "The request reached Lexi, but the AI service rejected it because the Hugging Face access token is missing, expired, or does not have permission to use the selected model.",
      fix: [
        "Check that the HF_TOKEN secret is set.",
        "Make sure the token is active and has access to the model you selected.",
        "After updating the token, restart the app and send the message again.",
      ],
    };
  }
  if (message.includes("rate") || message.includes("429") || message.includes("too many requests")) {
    return {
      title: "Lexi is being rate limited.",
      why: "The AI service is temporarily refusing extra requests because too many messages were sent in a short period of time, or the current account/model has hit its usage limit.",
      fix: ["Wait a minute before trying again.", "If it keeps happening, switch to another model.", "Use shorter prompts until the limit clears."],
    };
  }
  if (message.includes("model") && (message.includes("not found") || message.includes("unavailable") || message.includes("does not exist") || message.includes("404"))) {
    return {
      title: "The selected model is not available right now.",
      why: "Lexi tried to send your message to the chosen model, but the provider says that model cannot be found, is offline, or is not available for this token.",
      fix: ["Choose a different model from the selector.", "Try the same message again.", "If you need that exact model, confirm the model is still available through the provider."],
    };
  }
  if (message.includes("no response stream") || message.includes("no stream")) {
    return {
      title: "Lexi did not receive a usable response stream.",
      why: "The chat request connected, but the server did not return the live response channel Lexi needs to show text as it is generated.",
      fix: ["Try sending the message again.", "If it repeats, restart the API server.", "Use a different model to rule out a provider-side streaming problem."],
    };
  }
  if (message.includes("failed to fetch") || message.includes("network") || message.includes("load failed")) {
    return {
      title: "Lexi could not reach the server.",
      why: "The app could not complete the request. This usually means the API server is stopped, restarting, unreachable, or the network connection dropped.",
      fix: ["Wait a few seconds and try again.", "Restart the API server if messages keep failing.", "Check your internet connection."],
    };
  }
  if (message.includes("server error") || message.includes("500") || message.includes("502") || message.includes("503") || message.includes("504")) {
    return {
      title: "Lexi hit a server-side problem.",
      why: "Your message reached the app, but the backend or AI provider failed while processing it.",
      fix: ["Try again once Lexi finishes self-healing.", "If it still fails, restart the API server.", "If only one model fails, switch models and retry."],
    };
  }
  if (message.includes("command failed") || message.includes("exit") || message.includes("patch failed")) {
    return {
      title: "Lexi ran into a task execution error.",
      why: "Lexi attempted to run a command or apply an update, but that step failed before it could finish successfully.",
      fix: ["Read the original error below to see which step failed.", "Fix the missing file, invalid command, permission issue, or bad input mentioned there.", "Ask Lexi to retry the task after the specific issue is corrected."],
    };
  }
  return {
    title: "Lexi ran into an unexpected error.",
    why: "Something stopped Lexi from finishing the request, but the app did not receive a more specific category for the failure.",
    fix: ["Try the same message again.", "If it repeats, refresh the app and retry.", "If the exact same error keeps appearing, copy the original error below so it can be fixed directly."],
  };
}

export function explainLexiError(error: unknown, context = "request") {
  const rawMessage = normalizeErrorMessage(error).trim() || "An unknown error occurred";
  const details = matchError(rawMessage);
  return [
    `Lexi error report: ${details.title}`,
    "",
    `What happened: ${rawMessage}`,
    "",
    `Why this came up: ${details.why}`,
    "",
    "How to fix it:",
    ...details.fix.map((step, i) => `${i + 1}. ${step}`),
    "",
    `Where it happened: ${context}`,
  ].join("\n");
}
