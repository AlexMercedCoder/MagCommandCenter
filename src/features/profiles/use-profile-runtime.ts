import { useCallback, useEffect, useState } from "react";
import type {
  AgentProfileSummary,
  EffectiveAgentProfile,
  OapDocument,
  ProfileCheckpoint,
  ProfileContract,
  ProfilePreview,
  ResolvedAgentProfile,
} from "../../lib/types";
import { magentClient } from "../../magent";

export function useProfileRuntime(project: string, enabled = true) {
  const [profiles, setProfiles] = useState<AgentProfileSummary[]>([]);
  const [contract, setContract] = useState<ProfileContract | null>(null);
  const [selectedName, setSelectedName] = useState("");
  const [selected, setSelected] = useState<ResolvedAgentProfile | null>(null);
  const [effective, setEffective] = useState<EffectiveAgentProfile | null>(
    null,
  );
  const [defaultProfile, setDefaultProfileState] = useState("magagent");
  const [preview, setPreview] = useState<ProfilePreview | null>(null);
  const [inbox, setInbox] = useState<Array<Record<string, unknown>>>([]);
  const [models, setModels] = useState<
    Array<{ id?: string; name?: string; [key: string]: unknown }>
  >([]);
  const [revisions, setRevisions] = useState<ProfileCheckpoint[]>([]);
  const [loadedProject, setLoadedProject] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!enabled) return;
    setBusy(true);
    setError("");
    try {
      const [nextContract, nextDefault, nextInbox] = await Promise.all([
        magentClient.profileContract(project),
        magentClient.defaultProfile(project),
        magentClient.profileInbox(project),
      ]);
      const nextProfiles = nextContract.choices.profiles;
      setContract(nextContract);
      setProfiles(nextProfiles);
      setDefaultProfileState(nextDefault.profile);
      setInbox(nextInbox);
      setLoadedProject(project);
      setSelectedName((current) =>
        current && nextProfiles.some((item) => item.name === current)
          ? current
          : nextDefault.profile || nextProfiles[0]?.name || "",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [project, enabled]);

  const inspect = useCallback(
    async (name: string) => {
      if (!name) return;
      setBusy(true);
      setError("");
      try {
        const detail = await magentClient.profileDetail(name, project);
        setSelected(detail.profile);
        setEffective(detail.effective_profile);
        setRevisions(detail.checkpoints);
        setSelectedName(name);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [project],
  );

  useEffect(() => {
    if (enabled) void load();
  }, [load, enabled]);
  useEffect(() => {
    if (enabled && loadedProject === project && selectedName)
      void inspect(selectedName);
  }, [selectedName, inspect, enabled, loadedProject, project]);

  async function previewDocument(document: OapDocument) {
    setBusy(true);
    setError("");
    try {
      const result = await magentClient.previewProfile(document, project);
      setPreview(result);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveDocument(
    document: OapDocument,
    scope: string,
    expectedDigest = "",
    makeDefault = false,
  ) {
    setBusy(true);
    setError("");
    try {
      const result = await magentClient.applyProfile(
        document,
        scope,
        project,
        expectedDigest,
      );
      if (makeDefault)
        await magentClient.setDefaultProfile(document.metadata.name, project);
      await load();
      setSelectedName(document.metadata.name);
      await inspect(document.metadata.name);
      setPreview(null);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(name: string) {
    setBusy(true);
    try {
      await magentClient.setDefaultProfile(name, project);
      setDefaultProfileState(name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function useForGateways(name: string) {
    setBusy(true);
    setError("");
    try {
      return await magentClient.setGatewayProfile(name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function clone(source: string, name: string, scope: string) {
    setBusy(true);
    try {
      await magentClient.cloneProfile(source, name, scope, project);
      await load();
      setSelectedName(name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string, digest: string) {
    setBusy(true);
    try {
      await magentClient.deleteProfile(name, digest, project);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function restoreRevision(
    name: string,
    checkpoint: string,
    digest: string,
  ) {
    setBusy(true);
    setError("");
    try {
      const result = await magentClient.restoreProfileRevision(
        name,
        checkpoint,
        digest,
        project,
      );
      await load();
      await inspect(name);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function decideDelta(id: string, decision: "accept" | "reject") {
    setBusy(true);
    try {
      await magentClient.decideProfileDelta(id, decision, project);
      setInbox(await magentClient.profileInbox(project));
      if (decision === "accept" && selectedName) await inspect(selectedName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function importProfile(source: string, scope: string, dryRun = false) {
    setBusy(true);
    try {
      const result = await magentClient.importProfile(
        source,
        scope,
        project,
        dryRun,
      );
      if (!dryRun) await load();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function exportProfile(name: string, output: string) {
    setBusy(true);
    try {
      return await magentClient.exportProfile(name, output, project);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function loadModels(provider: string) {
    setModels([]);
    try {
      setModels(await magentClient.providerModels(provider));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return {
    profiles,
    contract,
    selectedName,
    setSelectedName,
    selected,
    effective,
    defaultProfile,
    preview,
    setPreview,
    inbox,
    models,
    revisions,
    busy,
    error,
    load,
    inspect,
    previewDocument,
    saveDocument,
    setDefault,
    useForGateways,
    clone,
    remove,
    restoreRevision,
    decideDelta,
    importProfile,
    exportProfile,
    loadModels,
  };
}

export type ProfileRuntime = ReturnType<typeof useProfileRuntime>;
