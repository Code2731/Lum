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
  syncOllama: () => Promise<void>;
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
  syncOllama,
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
              <h3>1. Ollama를 찾을 수 없습니다</h3>
              <p>
                LUM은 로컬 AI 터미널입니다. Ollama를 설치하고 실행해야 AI 기능을
                사용할 수 있습니다.
              </p>
              <a
                href="https://ollama.com"
                target="_blank"
                rel="noreferrer"
                className="setup-link"
              >
                Ollama 다운로드 사이트로 이동
              </a>
              <button
                className="setup-btn"
                onClick={() => syncOllama().then(() => setStep(2))}
              >
                설치 완료 후 확인
              </button>
            </div>
          )}
          {step === 2 && (
            <div className="setup-step">
              <h3>2. 최적의 추론 엔진 및 모델 선택</h3>
              <p>
                LUM이 사양(
                {hardwareSpecs?.total_memory_gb}GB RAM,{" "}
                {hardwareSpecs?.wgpu_supported ? "GPU 가속" : "CPU"})을
                분석했습니다.
              </p>

              <div
                className={`recommendation-box ${
                  hardwareSpecs?.recommended_engine === "xllm" ? "xllm-pro" : ""
                }`}
              >
                <div className="recommendation-badge">
                  {hardwareSpecs?.recommended_engine === "xllm"
                    ? "🔥 xLLM (EXL2) PRO 엔진 추천"
                    : "Recommended for You"}
                </div>
                <div className="recommendation-content">
                  <Zap size={20} className="text-accent" />
                  <div>
                    <div className="recommendation-name">{recommendedModel}</div>
                    <div className="recommendation-desc">
                      {hardwareSpecs?.recommended_engine === "xllm"
                        ? "GPU 최적화 EXL2 포맷으로 Ollama 대비 최대 5배 빠른 코딩 지원"
                        : "범용 GGUF 포맷으로 안정적인 로컬 코딩 지원"}
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
                  {recommendedModel} 설치 시작
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
