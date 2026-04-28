import React, { useState, useRef, useEffect } from "react";
import { Server, User, Key, Lock, Bookmark, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { SshProfile } from "../hooks/useTabManager";
import { useSshProfiles, type SshProfileEntry } from "../hooks/useSshProfiles";

interface Props {
  onConnect: (profile: SshProfile) => void;
  onClose: () => void;
}

const SshConnectModal: React.FC<Props> = ({ onConnect, onClose }) => {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [authType, setAuthType] = useState<"agent" | "key">("agent");
  const [keyPath, setKeyPath] = useState("");
  const [saveProfile, setSaveProfile] = useState(false);
  const [profileLabel, setProfileLabel] = useState("");

  const hostRef = useRef<HTMLInputElement>(null);
  const { profiles, save: saveToStore, remove } = useSshProfiles();

  useEffect(() => { hostRef.current?.focus(); }, []);

  const fillFromProfile = (p: SshProfileEntry) => {
    setHost(p.host);
    setPort(String(p.port));
    setUsername(p.username);
    setAuthType(p.keyPath ? "key" : "agent");
    setKeyPath(p.keyPath ?? "");
    setProfileLabel(p.label);
    setSaveProfile(false);
    hostRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim() || !username.trim()) return;

    const profile: SshProfile = {
      host: host.trim(),
      port: parseInt(port, 10) || 22,
      username: username.trim(),
      keyPath: authType === "key" && keyPath.trim() ? keyPath.trim() : undefined,
    };

    if (saveProfile) {
      const label = profileLabel.trim() || `${profile.username}@${profile.host}`;
      await saveToStore({ id: crypto.randomUUID(), label, ...profile }).catch(() => {});
    }

    onConnect(profile);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[440px] gap-0 p-0 overflow-hidden border-white/10 rounded-2xl">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/8">
          <Lock size={14} className="text-accent" />
          <DialogTitle className="text-sm font-semibold">SSH 연결</DialogTitle>
        </div>

        {profiles.length > 0 && (
          <div className="px-5 pt-4 space-y-1.5">
            <p className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1">
              <Bookmark size={9} />
              저장된 프로필
            </p>
            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {profiles.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 group bg-white/4 hover:bg-white/8 rounded-lg px-3 py-2 cursor-pointer transition-colors"
                  onClick={() => fillFromProfile(p)}
                >
                  <Server size={11} className="text-accent/70 shrink-0" />
                  <span className="text-xs font-medium text-white/80 flex-1 truncate">{p.label}</span>
                  <span className="text-[10px] text-white/30 font-mono truncate">
                    {p.username}@{p.host}:{p.port}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); remove(p.id); }}
                    className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all ml-1 shrink-0"
                    title="프로필 삭제"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
            <hr className="border-white/8 mt-2" />
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] text-white/40 uppercase tracking-wider">호스트</label>
              <div className="relative">
                <Server size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  ref={hostRef}
                  value={host}
                  onChange={e => setHost(e.target.value)}
                  placeholder="192.168.1.1 또는 myserver.com"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pl-8 text-xs outline-none focus:border-accent/50 font-mono"
                  required
                />
              </div>
            </div>
            <div className="w-20 space-y-1">
              <label className="text-[10px] text-white/40 uppercase tracking-wider">포트</label>
              <input
                value={port}
                onChange={e => setPort(e.target.value)}
                placeholder="22"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none focus:border-accent/50 font-mono text-center"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-white/40 uppercase tracking-wider">사용자명</label>
            <div className="relative">
              <User size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="ubuntu, root, ec2-user…"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pl-8 text-xs outline-none focus:border-accent/50 font-mono"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-white/40 uppercase tracking-wider">인증 방식</label>
            <div className="flex gap-2">
              {(["agent", "key"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setAuthType(type)}
                  className={`flex-1 py-1.5 rounded-lg text-xs transition-colors ${
                    authType === type
                      ? "bg-accent/20 text-accent border border-accent/30"
                      : "bg-white/5 text-white/40 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  {type === "agent" ? "🔑 SSH 에이전트 / 비밀번호" : "📄 키 파일"}
                </button>
              ))}
            </div>
          </div>

          {authType === "key" && (
            <div className="space-y-1">
              <label className="text-[10px] text-white/40 uppercase tracking-wider">개인 키 경로</label>
              <div className="relative">
                <Key size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  value={keyPath}
                  onChange={e => setKeyPath(e.target.value)}
                  placeholder="~/.ssh/id_rsa"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pl-8 text-xs outline-none focus:border-accent/50 font-mono"
                />
              </div>
            </div>
          )}

          {authType === "agent" && (
            <p className="text-[10px] text-white/30">
              SSH 에이전트 키 또는 ~/.ssh/config 프로필을 사용합니다. 비밀번호 인증이 필요하면 터미널에서 직접 입력하세요.
            </p>
          )}

          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={saveProfile}
              onChange={e => setSaveProfile(e.target.checked)}
              className="accent-accent w-3.5 h-3.5 rounded"
            />
            <span className="text-xs text-white/50 group-hover:text-white/70 transition-colors">이 연결 정보 저장</span>
          </label>

          {saveProfile && (
            <div className="space-y-1">
              <label className="text-[10px] text-white/40 uppercase tracking-wider">프로필 이름 (선택)</label>
              <input
                value={profileLabel}
                onChange={e => setProfileLabel(e.target.value)}
                placeholder={`${username || "user"}@${host || "host"}`}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none focus:border-accent/50 font-mono"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={!host.trim() || !username.trim()}
            className="w-full py-2 rounded-xl bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium mt-1"
          >
            연결
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SshConnectModal;
