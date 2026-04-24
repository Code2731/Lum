/// LUM 내장 추론 엔진 — Qwen2.5 아키텍처 (burn + wgpu)
///
/// 대상 모델: Qwen2.5-0.5B (hidden=896, heads=14, kv_heads=2, layers=24)
/// 가중치 형식: safetensors (bf16/f16/f32 → f32 변환 로딩)
/// 백엔드: WGPU (Metal/Vulkan/DX12/OpenGL 자동 선택)
use burn::{
    nn::{Embedding, EmbeddingConfig, Linear, LinearConfig},
    tensor::{activation, backend::Backend, Int, Shape, Tensor, TensorData},
};
use burn_wgpu::{Wgpu, WgpuDevice};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path, sync::Mutex};
use tokenizers::Tokenizer;

// ── 모델 설정 ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Qwen2Config {
    pub hidden_size: usize,
    pub intermediate_size: usize,
    pub num_attention_heads: usize,
    pub num_key_value_heads: usize,
    pub num_hidden_layers: usize,
    pub vocab_size: usize,
    pub rms_norm_eps: f32,
    pub rope_theta: f64,
    pub max_position_embeddings: usize,
}

impl Default for Qwen2Config {
    fn default() -> Self {
        // Qwen2.5-0.5B
        Self {
            hidden_size: 896,
            intermediate_size: 4864,
            num_attention_heads: 14,
            num_key_value_heads: 2,
            num_hidden_layers: 24,
            vocab_size: 151936,
            rms_norm_eps: 1e-6,
            rope_theta: 1_000_000.0,
            max_position_embeddings: 32768,
        }
    }
}

// ── RMS Norm ─────────────────────────────────────────────────────────────────

struct RmsNorm<B: Backend> {
    scale: Tensor<B, 1>,
    eps: f32,
}

impl<B: Backend> RmsNorm<B> {
    fn new(size: usize, eps: f32, device: &B::Device) -> Self {
        Self {
            scale: Tensor::ones(Shape::new([size]), device),
            eps,
        }
    }

    fn forward(&self, x: Tensor<B, 3>) -> Tensor<B, 3> {
        let [batch, seq, hidden] = x.dims();
        let var = (x.clone() * x.clone()).mean_dim(2); // [B, S, 1]
        let rms = (var + self.eps).sqrt();
        let x_norm = x / rms;
        x_norm
            * self
                .scale
                .clone()
                .reshape([1, 1, hidden])
                .expand([batch, seq, hidden])
    }
}

// ── RoPE ─────────────────────────────────────────────────────────────────────

fn build_rope_cache<B: Backend>(
    head_dim: usize,
    max_seq: usize,
    theta: f64,
    device: &B::Device,
) -> (Tensor<B, 3>, Tensor<B, 3>) {
    let half = head_dim / 2;
    let freqs: Vec<f32> = (0..half)
        .map(|i| 1.0_f32 / (theta as f32).powf(2.0 * i as f32 / head_dim as f32))
        .collect();

    let mut cos_data = Vec::with_capacity(max_seq * half);
    let mut sin_data = Vec::with_capacity(max_seq * half);
    for pos in 0..max_seq {
        for &f in &freqs {
            let angle = pos as f32 * f;
            cos_data.push(angle.cos());
            sin_data.push(angle.sin());
        }
    }

    let cos = Tensor::<B, 3>::from_data(TensorData::new(cos_data, [1, max_seq, half]), device);
    let sin = Tensor::<B, 3>::from_data(TensorData::new(sin_data, [1, max_seq, half]), device);
    (cos, sin)
}

fn apply_rope<B: Backend>(
    x: Tensor<B, 4>,   // [B, S, H, D]
    cos: Tensor<B, 3>, // [1, S, D/2]
    sin: Tensor<B, 3>, // [1, S, D/2]
) -> Tensor<B, 4> {
    let [batch, seq, heads, head_dim] = x.dims();
    let half = head_dim / 2;

    let x1 = x.clone().slice([0..batch, 0..seq, 0..heads, 0..half]);
    let x2 = x
        .clone()
        .slice([0..batch, 0..seq, 0..heads, half..head_dim]);

    let c = cos.unsqueeze_dim::<4>(2).expand([batch, seq, heads, half]);
    let s = sin.unsqueeze_dim::<4>(2).expand([batch, seq, heads, half]);

    let rx1 = x1.clone() * c.clone() - x2.clone() * s.clone();
    let rx2 = x1 * s + x2 * c;

    Tensor::cat(vec![rx1, rx2], 3)
}

// ── Attention ─────────────────────────────────────────────────────────────────

struct Attention<B: Backend> {
    q: Linear<B>,
    k: Linear<B>,
    v: Linear<B>,
    o: Linear<B>,
    num_heads: usize,
    num_kv_heads: usize,
    head_dim: usize,
    scale: f64,
}

impl<B: Backend> Attention<B> {
    fn new(device: &B::Device, cfg: &Qwen2Config) -> Self {
        let head_dim = cfg.hidden_size / cfg.num_attention_heads;
        let kv_dim = head_dim * cfg.num_key_value_heads;
        Self {
            q: LinearConfig::new(cfg.hidden_size, cfg.hidden_size)
                .with_bias(true)
                .init(device),
            k: LinearConfig::new(cfg.hidden_size, kv_dim)
                .with_bias(true)
                .init(device),
            v: LinearConfig::new(cfg.hidden_size, kv_dim)
                .with_bias(true)
                .init(device),
            o: LinearConfig::new(cfg.hidden_size, cfg.hidden_size)
                .with_bias(false)
                .init(device),
            num_heads: cfg.num_attention_heads,
            num_kv_heads: cfg.num_key_value_heads,
            head_dim,
            scale: (head_dim as f64).sqrt(),
        }
    }

    fn forward(&self, x: Tensor<B, 3>, cos: Tensor<B, 3>, sin: Tensor<B, 3>) -> Tensor<B, 3> {
        let [batch, seq, _] = x.dims();

        let q = self
            .q
            .forward(x.clone())
            .reshape([batch, seq, self.num_heads, self.head_dim]);
        let k = self
            .k
            .forward(x.clone())
            .reshape([batch, seq, self.num_kv_heads, self.head_dim]);
        let v = self
            .v
            .forward(x)
            .reshape([batch, seq, self.num_kv_heads, self.head_dim]);

        let q = apply_rope(q, cos.clone(), sin.clone());
        let k = apply_rope(k, cos, sin);

        // GQA: KV 헤드를 Q 헤드 수에 맞게 반복
        let groups = self.num_heads / self.num_kv_heads;
        let k = if groups > 1 {
            k.repeat(&[1, 1, groups, 1])
        } else {
            k
        };
        let v = if groups > 1 {
            v.repeat(&[1, 1, groups, 1])
        } else {
            v
        };

        // [B, S, H, D] → [B, H, S, D]
        let q = q.swap_dims(1, 2);
        let k = k.swap_dims(1, 2);
        let v = v.swap_dims(1, 2);

        let scores = q.matmul(k.transpose()) / self.scale;

        // Causal mask
        let dev = scores.device();
        let mask = Self::causal_mask::<B>(batch, self.num_heads, seq, &dev);
        let scores = scores + mask;

        let weights = activation::softmax(scores, 3);
        let out = weights.matmul(v); // [B, H, S, D]

        let out = out
            .swap_dims(1, 2)
            .reshape([batch, seq, self.num_heads * self.head_dim]);

        self.o.forward(out)
    }

    fn causal_mask<BB: Backend>(
        batch: usize,
        heads: usize,
        seq: usize,
        device: &BB::Device,
    ) -> Tensor<BB, 4> {
        let neg_inf = f32::NEG_INFINITY;
        let mut data = vec![0.0f32; seq * seq];
        for i in 0..seq {
            for j in (i + 1)..seq {
                data[i * seq + j] = neg_inf;
            }
        }
        Tensor::<BB, 2>::from_data(TensorData::new(data, [seq, seq]), device)
            .reshape([1, 1, seq, seq])
            .expand([batch, heads, seq, seq])
    }
}

// ── MLP (SwiGLU) ─────────────────────────────────────────────────────────────

struct Mlp<B: Backend> {
    gate: Linear<B>,
    up: Linear<B>,
    down: Linear<B>,
}

impl<B: Backend> Mlp<B> {
    fn new(device: &B::Device, cfg: &Qwen2Config) -> Self {
        Self {
            gate: LinearConfig::new(cfg.hidden_size, cfg.intermediate_size)
                .with_bias(false)
                .init(device),
            up: LinearConfig::new(cfg.hidden_size, cfg.intermediate_size)
                .with_bias(false)
                .init(device),
            down: LinearConfig::new(cfg.intermediate_size, cfg.hidden_size)
                .with_bias(false)
                .init(device),
        }
    }

    fn forward(&self, x: Tensor<B, 3>) -> Tensor<B, 3> {
        let gate = activation::silu(self.gate.forward(x.clone()));
        self.down.forward(gate * self.up.forward(x))
    }
}

// ── Decoder Layer ─────────────────────────────────────────────────────────────

struct DecoderLayer<B: Backend> {
    attn: Attention<B>,
    mlp: Mlp<B>,
    pre_norm: RmsNorm<B>,
    post_norm: RmsNorm<B>,
}

impl<B: Backend> DecoderLayer<B> {
    fn new(device: &B::Device, cfg: &Qwen2Config) -> Self {
        Self {
            attn: Attention::new(device, cfg),
            mlp: Mlp::new(device, cfg),
            pre_norm: RmsNorm::new(cfg.hidden_size, cfg.rms_norm_eps, device),
            post_norm: RmsNorm::new(cfg.hidden_size, cfg.rms_norm_eps, device),
        }
    }

    fn forward(&self, x: Tensor<B, 3>, cos: Tensor<B, 3>, sin: Tensor<B, 3>) -> Tensor<B, 3> {
        let x = x.clone() + self.attn.forward(self.pre_norm.forward(x), cos, sin);
        x.clone() + self.mlp.forward(self.post_norm.forward(x))
    }
}

// ── Full Model ────────────────────────────────────────────────────────────────

pub struct Qwen2Model {
    embed: Embedding<Wgpu>,
    layers: Vec<DecoderLayer<Wgpu>>,
    norm: RmsNorm<Wgpu>,
    lm_head: Linear<Wgpu>,
    cos: Tensor<Wgpu, 3>,
    sin: Tensor<Wgpu, 3>,
    device: WgpuDevice,
}

impl Qwen2Model {
    pub fn new(cfg: &Qwen2Config) -> Self {
        let device = WgpuDevice::default();
        let head_dim = cfg.hidden_size / cfg.num_attention_heads;
        let (cos, sin) = build_rope_cache::<Wgpu>(
            head_dim,
            cfg.max_position_embeddings,
            cfg.rope_theta,
            &device,
        );

        let layers = (0..cfg.num_hidden_layers)
            .map(|_| DecoderLayer::new(&device, cfg))
            .collect();

        Self {
            embed: EmbeddingConfig::new(cfg.vocab_size, cfg.hidden_size).init(&device),
            layers,
            norm: RmsNorm::new(cfg.hidden_size, cfg.rms_norm_eps, &device),
            lm_head: LinearConfig::new(cfg.hidden_size, cfg.vocab_size)
                .with_bias(false)
                .init(&device),
            cos,
            sin,
            device,
        }
    }

    fn forward(&self, ids: Tensor<Wgpu, 2, Int>) -> Tensor<Wgpu, 3> {
        let [_, seq] = ids.dims();
        let mut x = self.embed.forward(ids);

        let cos = self
            .cos
            .clone()
            .slice([0..1, 0..seq, 0..self.cos.dims()[2]]);
        let sin = self
            .sin
            .clone()
            .slice([0..1, 0..seq, 0..self.sin.dims()[2]]);

        for layer in &self.layers {
            x = layer.forward(x, cos.clone(), sin.clone());
        }

        self.lm_head.forward(self.norm.forward(x))
    }

    /// 텍스트 생성 (greedy decoding)
    pub fn generate(&self, input_ids: &[u32], max_new_tokens: usize, eos_id: u32) -> Vec<u32> {
        let mut tokens: Vec<i64> = input_ids.iter().map(|&t| t as i64).collect();
        let mut generated = Vec::new();

        for _ in 0..max_new_tokens {
            let seq_len = tokens.len();
            let input = Tensor::<Wgpu, 2, Int>::from_data(
                TensorData::new(tokens.clone(), [1, seq_len]),
                &self.device,
            );

            let logits = self.forward(input); // [1, S, vocab]
            let [_, _, vocab] = logits.dims();

            let last = logits
                .slice([0..1, (seq_len - 1)..seq_len, 0..vocab])
                .reshape([vocab]);

            let next_id = last.argmax(0).into_scalar() as u32;
            generated.push(next_id);
            tokens.push(next_id as i64);

            if next_id == eos_id {
                break;
            }
        }

        generated
    }
}

// ── 가중치 로딩 ───────────────────────────────────────────────────────────────

/// safetensors 파일에서 f32 벡터 추출 (bf16/f16/f32 모두 지원)
pub fn load_f32_from_safetensors(
    path: &Path,
    key: &str,
) -> std::result::Result<(Vec<f32>, Vec<usize>), String> {
    let data = fs::read(path).map_err(|e| e.to_string())?;
    let tensors = safetensors::SafeTensors::deserialize(&data).map_err(|e| e.to_string())?;

    let view = tensors
        .tensor(key)
        .map_err(|_| format!("텐서 '{key}' 없음"))?;

    let shape: Vec<usize> = view.shape().iter().map(|&s| s as usize).collect();
    let bytes = view.data();

    let floats = match view.dtype() {
        safetensors::Dtype::F32 => bytemuck::cast_slice::<u8, f32>(bytes).to_vec(),
        safetensors::Dtype::BF16 => bytemuck::cast_slice::<u8, u16>(bytes)
            .iter()
            .map(|&b| half::bf16::from_bits(b).to_f32())
            .collect(),
        safetensors::Dtype::F16 => bytemuck::cast_slice::<u8, u16>(bytes)
            .iter()
            .map(|&b| half::f16::from_bits(b).to_f32())
            .collect(),
        dt => return Err(format!("지원하지 않는 dtype: {dt:?}")),
    };

    Ok((floats, shape))
}

// ── 전역 상태 (Tauri Managed State) ──────────────────────────────────────────

pub struct LocalAIState {
    pub model: Mutex<Option<Qwen2Model>>,
    pub tokenizer: Mutex<Option<Tokenizer>>,
    pub config: Mutex<Option<Qwen2Config>>,
}

impl LocalAIState {
    pub fn new() -> Self {
        Self {
            model: Mutex::new(None),
            tokenizer: Mutex::new(None),
            config: Mutex::new(None),
        }
    }
}

// ── Tauri 커맨드 ──────────────────────────────────────────────────────────────

use crate::error::{LumError, Result};
use tauri::{command, State};

/// 모델 초기화 — safetensors + tokenizer.json 이 있는 디렉토리를 지정
#[command]
pub fn init_local_model(model_dir: String, state: State<LocalAIState>) -> Result<String> {
    let dir = Path::new(&model_dir);

    let tokenizer_path = dir.join("tokenizer.json");
    if !tokenizer_path.exists() {
        return Err(LumError::AiEngine(format!(
            "tokenizer.json 없음: {}",
            tokenizer_path.display()
        )));
    }
    let tokenizer =
        Tokenizer::from_file(&tokenizer_path).map_err(|e| LumError::AiEngine(e.to_string()))?;

    let cfg: Qwen2Config = dir
        .join("config.json")
        .exists()
        .then(|| fs::read_to_string(dir.join("config.json")).ok())
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let n_layers = cfg.num_hidden_layers;
    let hidden = cfg.hidden_size;
    let model = Qwen2Model::new(&cfg);

    *state.tokenizer.lock().unwrap() = Some(tokenizer);
    *state.config.lock().unwrap() = Some(cfg);
    *state.model.lock().unwrap() = Some(model);

    Ok(format!(
        "Qwen2.5 초기화 완료 ({}층, hidden={}). \
         실제 가중치 없이 랜덤 초기화 상태입니다. \
         safetensors 로딩은 다음 단계에서 지원됩니다.",
        n_layers, hidden
    ))
}

/// 로컬 AI로 텍스트 생성
#[command]
pub fn generate_with_local_model(
    prompt: String,
    max_new_tokens: usize,
    state: State<LocalAIState>,
) -> Result<String> {
    let tok_guard = state.tokenizer.lock().unwrap();
    let model_guard = state.model.lock().unwrap();

    let tokenizer = tok_guard.as_ref().ok_or_else(|| {
        LumError::AiEngine("모델 미초기화 — init_local_model을 먼저 호출하세요.".into())
    })?;
    let model = model_guard
        .as_ref()
        .ok_or_else(|| LumError::AiEngine("모델 미초기화.".into()))?;

    let encoding = tokenizer
        .encode(prompt.as_str(), false)
        .map_err(|e| LumError::AiEngine(e.to_string()))?;

    let input_ids: Vec<u32> = encoding.get_ids().to_vec();
    let eos_id = tokenizer
        .token_to_id("<|im_end|>")
        .or_else(|| tokenizer.token_to_id("<|endoftext|>"))
        .unwrap_or(151645);

    let output_ids = model.generate(&input_ids, max_new_tokens.min(512), eos_id);

    tokenizer
        .decode(&output_ids, true)
        .map_err(|e| LumError::AiEngine(e.to_string()))
}

/// 모델 상태 조회
#[command]
pub fn get_local_model_status(state: State<LocalAIState>) -> String {
    if state.model.lock().unwrap().is_some() {
        let guard = state.config.lock().unwrap();
        match guard.as_ref() {
            Some(c) => format!(
                "로드됨 — Qwen2.5 ({}층, hidden={}, {}Q/{}KV heads)",
                c.num_hidden_layers, c.hidden_size, c.num_attention_heads, c.num_key_value_heads
            ),
            None => "로드됨".into(),
        }
    } else {
        "미초기화 — init_local_model을 호출하세요.".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qwen2_config_default() {
        let cfg = Qwen2Config::default();
        assert_eq!(cfg.hidden_size, 896);
        assert_eq!(cfg.num_attention_heads, 14);
        assert_eq!(cfg.num_key_value_heads, 2);
        assert_eq!(cfg.num_hidden_layers, 24);
    }

    #[test]
    fn test_config_serialization() {
        let cfg = Qwen2Config::default();
        let json = serde_json::to_string(&cfg).unwrap();
        let decoded: Qwen2Config = serde_json::from_str(&json).unwrap();
        assert_eq!(cfg.hidden_size, decoded.hidden_size);
        assert_eq!(cfg.vocab_size, decoded.vocab_size);
    }

    #[test]
    #[ignore = "WGPU 어댑터 없는 CI 환경에서는 건너뜀"]
    fn test_model_forward_pass() {
        let cfg = Qwen2Config {
            hidden_size: 64,
            intermediate_size: 128,
            num_attention_heads: 2,
            num_key_value_heads: 1,
            num_hidden_layers: 2,
            vocab_size: 1000,
            rms_norm_eps: 1e-6,
            rope_theta: 10000.0,
            max_position_embeddings: 128,
        };
        let model = Qwen2Model::new(&cfg);
        let output = model.generate(&[1u32, 2, 3], 3, 2);
        assert!(!output.is_empty());
    }
}
