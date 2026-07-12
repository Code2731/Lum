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

export interface SshProfilesMeta {
  title: string;
  badges: [string, string, string];
  helper: string;
}

export function getSshProfilesMeta(profiles: SshProfileEntry[]): SshProfilesMeta {
  const profileCount = profiles.length;
  const keyProfileCount = profiles.filter((profile) => Boolean(profile.keyPath?.trim())).length;

  return {
    title: profileCount > 0 ? `SSH 프로필 ${profileCount}개 준비됨` : "저장된 SSH 프로필이 없습니다",
    badges: [
      `프로필 ${profileCount}개`,
      `키 연결 ${keyProfileCount}개`,
      profileCount > 0 ? "바로 접속 가능" : "새 원격 연결 추가",
    ],
    helper: profileCount > 0
      ? "자주 쓰는 원격 접속 정보를 저장해 두고 현재 터미널에서 바로 세션을 시작할 수 있습니다."
      : "호스트, 포트, 사용자 정보를 저장해두면 다음부터는 원격 세션을 더 빠르게 시작할 수 있습니다.",
  };
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
