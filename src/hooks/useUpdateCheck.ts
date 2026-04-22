import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface UpdateInfo {
  latest: string;
  releaseUrl: string;
  releaseName: string;
}

export interface UpdateProgress {
  downloaded: number;
  total: number;
}

export function useUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    invoke<{ has_update: boolean; latest: string; release_url: string; release_name: string }>(
      "check_for_update",
    )
      .then((info) => {
        if (info.has_update) {
          setUpdateInfo({
            latest: info.latest,
            releaseUrl: info.release_url,
            releaseName: info.release_name,
          });
        }
      })
      .catch(() => {});
  }, []);

  // 다운로드 진행률 이벤트 수신 — 설치 중일 때만 구독
  useEffect(() => {
    if (!installing) return;
    const unlisten = listen<UpdateProgress>("update_progress", (e) => {
      setProgress(e.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [installing]);

  const installUpdate = useCallback(async () => {
    setInstalling(true);
    setInstallError(null);
    setProgress(null);
    try {
      await invoke("install_update");
      // 성공 시 app.restart()가 호출되므로 이 줄은 보통 실행되지 않음
    } catch (e) {
      setInstallError(String(e));
      setInstalling(false);
      setProgress(null);
    }
  }, []);

  return {
    updateInfo,
    installing,
    progress,
    installError,
    installUpdate,
    dismissUpdate: () => {
      setUpdateInfo(null);
      setInstallError(null);
    },
  };
}
