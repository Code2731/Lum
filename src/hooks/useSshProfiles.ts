import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SshProfileEntry {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  keyPath?: string;
}

// Rust bridge types (snake_case)
type RustSshProfileEntry = {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  key_path?: string | null;
};

function toRust(p: SshProfileEntry): RustSshProfileEntry {
  return {
    id: p.id,
    label: p.label,
    host: p.host,
    port: p.port,
    username: p.username,
    key_path: p.keyPath ?? null,
  };
}

function fromRust(r: RustSshProfileEntry): SshProfileEntry {
  return {
    id: r.id,
    label: r.label,
    host: r.host,
    port: r.port,
    username: r.username,
    keyPath: r.key_path ?? undefined,
  };
}

export function useSshProfiles() {
  const [profiles, setProfiles] = useState<SshProfileEntry[]>([]);

  useEffect(() => {
    invoke<RustSshProfileEntry[]>("list_ssh_profiles")
      .then((raw) => setProfiles(raw.map(fromRust)))
      .catch(() => {});
  }, []);

  const save = useCallback(async (p: SshProfileEntry) => {
    await invoke("save_ssh_profile", { profile: toRust(p) });
    setProfiles((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      return idx >= 0 ? prev.map((x, i) => (i === idx ? p : x)) : [...prev, p];
    });
  }, []);

  const remove = useCallback(async (id: string) => {
    await invoke("delete_ssh_profile", { id });
    setProfiles((prev) => prev.filter((x) => x.id !== id));
  }, []);

  return { profiles, save, remove };
}
