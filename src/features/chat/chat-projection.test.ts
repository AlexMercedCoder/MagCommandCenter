import { describe, expect, it } from "vitest";
import { projectChatEvents, responseAssistantText } from "./chat-projection";

describe("chat event projection", () => {
  it("assembles streamed assistant chunks without exposing private reasoning", () => {
    expect(
      projectChatEvents([
        { type: "chunk", content: "I built " },
        { type: "chunk", content: "the site." },
      ]).assistantText,
    ).toBe("I built the site.");
  });

  it("prefers the final assistant message and exposes activity summaries", () => {
    const projection = projectChatEvents([
      {
        type: "tool_progress",
        activity: {
          phase: "verify",
          intent: "Checking the generated files",
          expected: "Confirm the site loads",
        },
      },
      { type: "assistant_message", content: "The website is ready." },
    ]);
    expect(projection.assistantText).toBe("The website is ready.");
    expect(projection.progress).toEqual([
      "Checking the generated files — Confirm the site loads",
    ]);
  });

  it("decodes nested JSON stream lines and response event envelopes", () => {
    const event = JSON.stringify({
      type: "assistant_message",
      content: "Finished from the stream.",
    });
    expect(
      projectChatEvents([{ type: "stdout", detail: event }]).assistantText,
    ).toBe("Finished from the stream.");
    expect(
      responseAssistantText({
        ok: true,
        events: [{ type: "assistant_message", content: "Final answer" }],
      }),
    ).toBe("Final answer");
  });
});
