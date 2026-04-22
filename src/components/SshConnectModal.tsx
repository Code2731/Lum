import React, { useState, useRef, useEffect } from "react";
import { X, Server, User, Key, Lock } from "lucide-react";
import type { SshProfile } from "../hooks/useTabManager";

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
  const hostRef = useRef<HTMLInputElement>(null);

  useEffect(() => { hostRef.current?.focus(); }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim() || !username.trim()) return;
    onConnect({
      host: host.trim(),
      port: parseInt(port, 10) || 22,
      username: username.trim(),
      keyPath: authType === "key" && keyPath.trim() ? keyPath.trim() : undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#0d1117] border border-white/10 rounded-2xl w-[440px] shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/8">
          <Lock size={14} className="text-accent" />
          <span className="text-sm font-semibold">SSH 연결</span>
          <button onClick={onClose} className="ml-auto text-white/30 hover:text-white/70 transition-colors">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          {/* Host + Port */}
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

          {/* Username */}
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

          {/* Auth method */}
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

          {/* Key file path */}
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

          <button
            type="submit"
            disabled={!host.trim() || !username.trim()}
            className="w-full py-2 rounded-xl bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium mt-1"
          >
            연결
          </button>
        </form>
      </div>
    </div>
  );
};

export default SshConnectModal;
