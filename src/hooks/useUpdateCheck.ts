import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UpdateInfo {
  latest: string;
  releaseUrl: string;
  releaseName: string;
}

export function useUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

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

  return { updateInfo, dismissUpdate: () => setUpdateInfo(null) };
}
