import { describe, expect, it } from "vitest";
import type { OapDocument, ProfileContract } from "../../lib/types";
import {
  applyTemplate,
  buildProfileDocument,
  draftFromDocument,
  emptyProfileDraft,
} from "./profile-builder";

const contract = {
  choices: {
    providers: [
      {
        id: "nous-portal",
        label: "Nous",
        default_model: "deepseek-v4-flash",
        access_mode: "api",
      },
    ],
    tool_packs: [
      {
        name: "files",
        description: "Files",
        tools: ["read_file", "write_file"],
        enabled: true,
      },
    ],
  },
} as ProfileContract;

describe("OAP profile builder", () => {
  it("builds a normalized profile with explicit and packed tools", () => {
    const draft = applyTemplate(
      {
        ...emptyProfileDraft(contract),
        name: "Research Helper",
        title: "Research Helper",
        explicitTools: ["web_search"],
        toolPacks: ["files"],
      },
      "researcher",
    );
    draft.toolPacks = ["files"];
    const document = buildProfileDocument(draft, contract);

    expect(document.metadata.name).toBe("research-helper");
    expect(document.spec.tools?.allow).toEqual([
      "web_search",
      "read_file",
      "write_file",
    ]);
    expect(document.spec.model).toEqual({
      provider: "nous-portal",
      id: "deepseek-v4-flash",
    });
  });

  it("round-trips object references and context files without stringifying objects", () => {
    const document = {
      oap: "1.0",
      metadata: { name: "reviewer", revision: 3 },
      spec: {
        role: { instructions: "Review." },
        tools: {
          allow: ["read_file"],
          skills: [{ name: "review" }],
          mcp_servers: [{ name: "github" }],
        },
        runtime: {
          subagents: { allow: [{ name: "explore" }], max_subagents: 1 },
        },
        context: { files: [{ path: "AGENTS.md" }] },
      },
    } as OapDocument;
    const draft = draftFromDocument(document, "project");

    expect(draft.skills).toEqual(["review"]);
    expect(draft.mcpServers).toEqual(["github"]);
    expect(draft.subagents).toEqual(["explore"]);
    expect(draft.contextFiles).toBe("AGENTS.md");
  });
});
