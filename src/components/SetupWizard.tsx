import React from "react";
import { Zap } from "lucide-react";

interface Props {
  step: number;
  setStep: (step: number) => void;
  onClose: () => void;
  hardwareSpecs: any;
  pullProgress: any;
  handlePullModel: (model: string) => void;
  models: string[];
  recommendedModel: string;
  syncXllm: () => Promise<void>;
}

const SetupWizard: React.FC<Props> = ({
  step,
  setStep,
  onClose,
  hardwareSpecs,
  pullProgress,
  handlePullModel,
  models,
  recommendedModel,
  syncXllm,
}) => {
  return (
    <div className="setup-wizard-overlay">
      <div className="setup-wizard-modal">
        <div className="setup-wizard-header">
          <Zap size={24} className="text-accent animate-pulse" />
          <h2>LUM Setup Wizard</h2>
        </div>

        <div className="setup-wizard-body">
          {step === 1 && (
            <div className="setup-step">
              <h3>1. xLLM 서버를 찾을 수 없습니다</h3>
              <p>
                LUM은 로컬 AI 터미널입니다. xLLM(TabbyAPI)을 설치하고 실행해야
                AI 기능을 사용할 수 있습니다.
              </p>
              <a
                href="https://github.com/theroyallab/tabbyAPI"
                target="_blank"
                rel="noreferrer"
                className="setup-link"
              >
                TabbyAPI (xLLM) 설치 가이드
              </a>
              <p className="setup-hint">
                설치 후 <code>python main.py</code>로 실행하면 기본적으로
                <code>http://127.0.0.1:8080</code>에서 자동으로 연결을 시도합니다.
                (구형 환경에서는 <code>5000</code>도 사용되니 포트가 다르면 해당 값으로 맞춰 주세요.)
              </p>
              <button
                className="setup-btn"
                onClick={() => syncXllm().then(() => setStep(2))}
              >
                서버 실행 후 확인
              </button>
            </div>
          )}
          {step === 2 && (
            <div className="setup-step">
              <h3>2. 최적의 모델 선택</h3>
              <p>
                LUM이 사양({hardwareSpecs?.gpu_type === "discrete" && hardwareSpecs?.gpu_vram_gb
                  ? `${hardwareSpecs.gpu_vram_gb}GB VRAM`
                  : `${hardwareSpecs?.total_memory_gb}GB RAM`},{" "}
                {hardwareSpecs?.wgpu_supported ? "GPU 가속" : "CPU"})을
                분석했습니다.
              </p>

              <div className="recommendation-box xllm-pro">
                <div className="recommendation-badge">
                  🔥 xLLM (EXL2) — ExLlamaV2 최적화 추론
                </div>
                <div className="recommendation-content">
                  <Zap size={20} className="text-accent" />
                  <div>
                    <div className="recommendation-name">{recommendedModel}</div>
                    <div className="recommendation-desc">
                      GPU 최적화 EXL2 포맷 — 동급 모델 대비 최대 5배 빠른 추론 속도
                    </div>
                  </div>
                </div>
              </div>

              {pullProgress ? (
                <div className="pull-progress-card">
                  <div className="pull-status">
                    {pullProgress.status} (
                    {Math.round(
                      ((pullProgress.completed || 0) /
                        (pullProgress.total || 1)) *
                        100
                    )}
                    %)
                  </div>
                  <div className="progress-bar-bg">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${
                          ((pullProgress.completed || 0) /
                            (pullProgress.total || 1)) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  className="setup-btn primary"
                  onClick={() => handlePullModel(recommendedModel)}
                >
                  {recommendedModel} 로드
                </button>
              )}
              {(models.includes(recommendedModel) ||
                models.some((m) =>
                  m.startsWith(recommendedModel.split(" ")[0])
                )) && (
                <button className="setup-btn" onClick={() => setStep(3)}>
                  다음 단계
                </button>
              )}
            </div>
          )}
          {step === 3 && (
            <div className="setup-step">
              <h3>3. 모든 준비가 완료되었습니다!</h3>
              <p>이제 LUM의 강력한 자율 에이전트와 시각적 셸을 경험해 보세요.</p>
              <button className="setup-btn primary" onClick={onClose}>
                시작하기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SetupWizard;
