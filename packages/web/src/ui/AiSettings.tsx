import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  applyAction,
  chooseBotAction,
  createGame,
  getLegalActions,
  getPlayerView,
  type Action,
  type PlayerView,
} from '@manila/engine';
import { useGame } from '../game/store';
import { decideWithLlm } from '../llm/player';
import { buildTurnPrompt } from '../llm/prompt';
import { chatEndpoint, listModels } from '../llm/providers';
import {
  ANTHROPIC_DEFAULT_MAX_TOKENS,
  PRESETS,
  copyProfile,
  newProfile,
  presetById,
  presetFor,
  useLlmSettings,
  validateProfile,
  type LlmEffort,
  type LlmProfile,
  type LlmSettings,
} from '../llm/settings';
import './ai.css';

/**
 * "AI 玩家设置": profiles for language-model seats (endpoint, key, model, options), with a
 * connection test that plays one real decision. Edits stay in a draft until saved.
 */
export function AiSettings({ onClose }: { onClose: () => void }) {
  const saved = useLlmSettings((s) => s.settings);
  const save = useLlmSettings((s) => s.save);
  const [draft, setDraft] = useState<LlmSettings>(() => structuredClone(saved));
  const [selected, setSelected] = useState<string | null>(saved.profiles[0]?.id ?? null);
  const [choosing, setChoosing] = useState(saved.profiles.length === 0);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const profile = draft.profiles.find((p) => p.id === selected) ?? null;
  const names = draft.profiles.map((p) => p.name);

  const close = () => {
    if (dirty && !window.confirm('有未保存的修改，确定放弃吗？')) return;
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const patch = (id: string, change: Partial<LlmProfile>) => {
    setDraft((d) => ({
      ...d,
      profiles: d.profiles.map((p) => (p.id === id ? { ...p, ...change } : p)),
    }));
    setMessage(null);
  };
  const create = (presetId: string) => {
    const p = newProfile(presetId, names);
    setDraft((d) => ({ ...d, profiles: [...d.profiles, p] }));
    setSelected(p.id);
    setChoosing(false);
    setErrors([]);
  };
  const duplicate = (p: LlmProfile) => {
    const copy = copyProfile(p, names);
    setDraft((d) => ({ ...d, profiles: [...d.profiles, copy] }));
    setSelected(copy.id);
  };
  const remove = (p: LlmProfile) => {
    if (!window.confirm(`删除配置「${p.name}」？使用它的电脑座位会改由内置电脑接管。`)) return;
    const rest = draft.profiles.filter((x) => x.id !== p.id);
    setDraft((d) => ({ ...d, profiles: rest }));
    setSelected(rest[0]?.id ?? null);
    setChoosing(rest.length === 0);
    setErrors([]);
  };
  const commit = () => {
    for (const p of draft.profiles) {
      const problems = validateProfile(p, draft.profiles);
      if (problems.length) {
        setSelected(p.id);
        setChoosing(false);
        setErrors(problems);
        return;
      }
    }
    setErrors([]);
    const ok = save(structuredClone(draft));
    useGame.getState().retryLlmSeats();
    setMessage(
      ok ? '已保存' : '浏览器拒绝写入本地存储（可能是隐私模式）：设置只在这次打开期间有效',
    );
  };

  return createPortal(
    <div className="curtain-backdrop" onClick={close}>
      <div className="ai-settings panel" onClick={(e) => e.stopPropagation()}>
        <div className="rules-head">
          <h2>AI 玩家设置</h2>
          <button className="btn tiny ghost" onClick={close} aria-label="关闭">
            ×
          </button>
        </div>
        <p className="muted ai-intro">
          让大语言模型扮演电脑玩家：在这里保存接口地址、API Key
          和模型，开局时把座位设为「AI·配置名」。 AI
          只能从规则允许的动作里选；回复无效、超时或出错时，这一步由内置电脑代走。
        </p>

        <div className="ai-body">
          <aside className="ai-list">
            <ul>
              {draft.profiles.map((p) => (
                <li key={p.id}>
                  <button
                    className={`ai-item ${p.id === selected && !choosing ? 'on' : ''}`}
                    onClick={() => {
                      setSelected(p.id);
                      setChoosing(false);
                      setErrors([]);
                    }}
                  >
                    <span className="ai-item-name">{p.name || '（未命名）'}</span>
                    <span className="ai-item-model">{p.model || '未填模型'}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn tiny" onClick={() => setChoosing(true)}>
              + 新建配置
            </button>
          </aside>

          <section className="ai-form">
            {choosing || !profile ? (
              <PresetChooser onPick={create} first={draft.profiles.length === 0} />
            ) : (
              <ProfileForm
                key={profile.id}
                profile={profile}
                errors={errors}
                onChange={(change) => patch(profile.id, change)}
                onDuplicate={() => duplicate(profile)}
                onRemove={() => remove(profile)}
              />
            )}
          </section>
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={draft.showReasons}
            onChange={(e) => {
              setDraft((d) => ({ ...d, showReasons: e.target.checked }));
              setMessage(null);
            }}
          />
          在航海日志里显示 AI 每一步的理由（公开给所有人看，像牌桌上的闲聊）
        </label>
        <p className="ai-privacy">
          API Key 以明文保存在本浏览器的 localStorage
          里，只会发给你填写的接口地址；公用电脑上请取消「记住密钥」。
          请求直接从浏览器发出：有的服务不允许网页直接访问（跨域
          CORS），这时可以换一个服务、用本地模型，或经自己的代理转发。
        </p>
        <div className="row ai-actions">
          {message && <span className={message === '已保存' ? 'ok' : 'warn'}>{message}</span>}
          {dirty && !message && <span className="muted">有未保存的修改</span>}
          <span className="spacer" />
          <button className="btn ghost" onClick={close}>
            关闭
          </button>
          <button className="btn" disabled={!dirty} onClick={commit}>
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PresetChooser({ onPick, first }: { onPick: (id: string) => void; first: boolean }) {
  return (
    <div className="ai-presets">
      <p>{first ? '还没有 AI 配置。选一个服务商开始：' : '选一个服务商作为起点：'}</p>
      <div className="ai-preset-grid">
        {PRESETS.map((p) => (
          <button key={p.id} className="btn ghost" onClick={() => onPick(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <p className="muted">
        「OpenAI 兼容」格式适用于绝大多数服务和本地模型（Ollama、LM Studio、vLLM
        等）；之后可以随时修改地址和模型。
      </p>
    </div>
  );
}

/** Parse an optional number field: '' → undefined. */
const optionalNumber = (v: string) => (v.trim() === '' ? undefined : Number(v));

function ProfileForm({
  profile: p,
  errors,
  onChange,
  onDuplicate,
  onRemove,
}: {
  profile: LlmProfile;
  errors: string[];
  onChange: (change: Partial<LlmProfile>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsNote, setModelsNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [fetching, setFetching] = useState(false);
  const preset = presetFor(p);
  const suggestions = useMemo(
    () => [...new Set([...(preset?.models ?? []), ...models])],
    [preset, models],
  );
  let endpoint = '';
  try {
    endpoint = p.baseUrl.trim() ? chatEndpoint(p) : '';
  } catch {
    endpoint = '';
  }

  const applyPreset = (id: string) => {
    const next = presetById(id);
    if (!next) return;
    const keepModel = next.models.length === 0 ? p.model : next.models.includes(p.model);
    onChange({
      provider: next.provider,
      baseUrl: next.baseUrl || p.baseUrl,
      model: keepModel === true ? p.model : (next.models[0] ?? p.model),
    });
    setModels([]);
    setModelsNote(null);
  };

  const fetchModels = async () => {
    setFetching(true);
    setModelsNote(null);
    try {
      const ids = await listModels(p);
      setModels(ids);
      setModelsNote(
        ids.length
          ? { ok: true, text: `获取到 ${ids.length} 个模型，点模型输入框可以选择` }
          : { ok: false, text: '接口没有返回模型列表' },
      );
    } catch (e) {
      setModelsNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setFetching(false);
    }
  };

  const listId = `ai-models-${p.id}`;
  return (
    <div className="ai-fields">
      {errors.length > 0 && (
        <ul className="warn ai-errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <Field label="配置名称">
        <input
          className="input"
          value={p.name}
          maxLength={20}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Field>
      <Field label="服务商">
        <select
          className="input"
          value={preset?.id ?? 'custom'}
          onChange={(e) => applyPreset(e.target.value)}
        >
          {PRESETS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="接口格式">
        <span className="ai-radios">
          <label className="check">
            <input
              type="radio"
              checked={p.provider === 'openai'}
              onChange={() => onChange({ provider: 'openai' })}
            />
            OpenAI 兼容（Chat Completions）
          </label>
          <label className="check">
            <input
              type="radio"
              checked={p.provider === 'anthropic'}
              onChange={() => onChange({ provider: 'anthropic' })}
            />
            Anthropic（Messages API）
          </label>
        </span>
      </Field>
      <Field label="接口地址" hint={endpoint && `实际请求：${endpoint}`}>
        <input
          className="input"
          value={p.baseUrl}
          placeholder="https://…/v1"
          spellCheck={false}
          onChange={(e) => onChange({ baseUrl: e.target.value })}
        />
      </Field>
      {preset?.note && <p className="muted ai-note">{preset.note}</p>}
      <Field
        label="API Key"
        hint={preset?.keyOptional ? '本地服务通常不需要密钥，可以留空' : undefined}
      >
        <span className="ai-inline">
          <input
            className="input"
            type={showKey ? 'text' : 'password'}
            value={p.apiKey}
            placeholder={preset?.keyOptional ? '（可留空）' : 'sk-…'}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => onChange({ apiKey: e.target.value })}
          />
          <button className="btn tiny ghost" onClick={() => setShowKey((v) => !v)}>
            {showKey ? '隐藏' : '显示'}
          </button>
        </span>
        <label className="check">
          <input
            type="checkbox"
            checked={p.rememberKey}
            onChange={(e) => onChange({ rememberKey: e.target.checked })}
          />
          记住密钥（不勾选则只保留到关闭这个标签页）
        </label>
      </Field>
      <Field label="模型">
        <span className="ai-inline">
          <input
            className="input"
            list={listId}
            value={p.model}
            placeholder="模型名称"
            spellCheck={false}
            onChange={(e) => onChange({ model: e.target.value })}
          />
          <button className="btn tiny ghost" disabled={fetching} onClick={fetchModels}>
            {fetching ? '获取中…' : '获取模型列表'}
          </button>
        </span>
        <datalist id={listId}>
          {suggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        {modelsNote && (
          <span className={`ai-hint ${modelsNote.ok ? 'ok' : 'warn'}`}>{modelsNote.text}</span>
        )}
      </Field>
      <Field label="打法风格" hint="可选：会附在规则说明后面，例如「激进一点，喜欢当海盗」">
        <textarea
          className="input"
          rows={2}
          maxLength={500}
          value={p.instructions}
          onChange={(e) => onChange({ instructions: e.target.value })}
        />
      </Field>

      <details className="ai-advanced">
        <summary>高级选项</summary>
        <Field label="温度" hint="留空 = 用模型默认值（有些推理模型不接受自定义温度）">
          <input
            className="input short"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={p.temperature ?? ''}
            onChange={(e) => onChange({ temperature: optionalNumber(e.target.value) })}
          />
        </Field>
        <Field
          label="最大输出 tokens"
          hint={
            p.provider === 'anthropic'
              ? `留空 = ${ANTHROPIC_DEFAULT_MAX_TOKENS}（含思考过程）`
              : '留空 = 不限制（由服务决定）'
          }
        >
          <input
            className="input short"
            type="number"
            min={16}
            step={1}
            value={p.maxTokens ?? ''}
            onChange={(e) => onChange({ maxTokens: optionalNumber(e.target.value) })}
          />
        </Field>
        <Field
          label="推理强度"
          hint={
            p.provider === 'anthropic'
              ? '对应 output_config.effort；不支持的模型请保持默认'
              : '对应 reasoning_effort；只对推理模型有效，不支持的服务请保持默认'
          }
        >
          <select
            className="input short"
            value={p.effort ?? ''}
            onChange={(e) =>
              onChange({ effort: (e.target.value || undefined) as LlmEffort | undefined })
            }
          >
            <option value="">默认</option>
            <option value="low">low（快）</option>
            <option value="medium">medium</option>
            <option value="high">high（慢）</option>
          </select>
        </Field>
        <Field label="超时（秒）" hint="超过这个时间没有回复，这一步由内置电脑代走">
          <input
            className="input short"
            type="number"
            min={5}
            max={600}
            value={p.timeoutSec}
            onChange={(e) => onChange({ timeoutSec: Number(e.target.value) })}
          />
        </Field>
        <Field label="附加请求参数" hint='JSON 对象，原样合并进请求体，例如 {"top_p": 0.9}'>
          <textarea
            className="input mono"
            rows={2}
            spellCheck={false}
            value={p.extraBody}
            placeholder="{}"
            onChange={(e) => onChange({ extraBody: e.target.value })}
          />
        </Field>
      </details>

      <ConnectionTest profile={p} />

      <div className="row ai-profile-actions">
        <button className="btn tiny ghost" onClick={onDuplicate}>
          复制这个配置
        </button>
        <button className="btn tiny ghost" onClick={onRemove}>
          删除
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ai-field">
      <span className="ai-label">{label}</span>
      <div className="ai-control">
        {children}
        {hint && <span className="ai-hint muted">{hint}</span>}
      </div>
    </div>
  );
}

/** A first-round placement decision from a fixed game, for testing a profile end to end. */
function samplePosition(): { view: PlayerView; legal: Action[] } {
  let state = createGame({
    players: [
      { name: '小红', color: 'red' },
      { name: '阿蓝', color: 'blue' },
      { name: '橙子', color: 'orange' },
      { name: '紫苏', color: 'purple' },
    ],
    seed: 2026,
  });
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Let the built-in computer play up to the second placement round of voyage 1.
  for (let i = 0; i < 80; i++) {
    const p = state.pending;
    if (!('playerId' in p)) break;
    if (p.type === 'place-accomplice' && p.round >= 2) break;
    const action = chooseBotAction(
      getPlayerView(state, p.playerId),
      getLegalActions(state, p.playerId),
      { level: 'normal', random },
    );
    const r = applyAction(state, action);
    if (!r.ok) break;
    state = r.state;
  }
  const actor = 'playerId' in state.pending ? state.pending.playerId : 'p1';
  return { view: getPlayerView(state, actor), legal: getLegalActions(state, actor) };
}

type TestResult =
  | { ok: true; ms: number; command: string; label: string; reason: string; raw: string }
  | { ok: false; error: string };

function ConnectionTest({ profile }: { profile: LlmProfile }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);
  const mode = useGame((s) => s.mode);

  const run = async () => {
    if (running) {
      ctrl.current?.abort();
      return;
    }
    const problems = validateProfile(profile);
    if (problems.length) {
      setResult({ ok: false, error: problems.join('；') });
      return;
    }
    setRunning(true);
    setResult(null);
    ctrl.current = new AbortController();
    const start = performance.now();
    try {
      const { view, legal } = samplePosition();
      const d = await decideWithLlm({ profile, view, legal, signal: ctrl.current.signal });
      const option = buildTurnPrompt(view, legal).options.find((o) => o.command === d.command);
      setResult({
        ok: true,
        ms: performance.now() - start,
        command: d.command,
        label: option?.label ?? '',
        reason: d.reason,
        raw: d.raw,
      });
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="ai-test">
      <div className="ai-inline">
        <button className="btn tiny" disabled={mode !== 'live'} onClick={run}>
          {running ? '停止测试' : '测试连接'}
        </button>
        <span className="muted">
          {running
            ? '正在请模型走一步示例棋……'
            : '用一个示例局面请模型做一次真实决定（会消耗少量额度）'}
        </span>
      </div>
      {result?.ok && (
        <div className="ai-result ok">
          ✓ 连接成功，用时 {(result.ms / 1000).toFixed(1)} 秒。模型选择了{' '}
          <code>{result.command}</code>
          {result.label && `（${result.label}）`}
          {result.reason && <div className="ai-reason">理由：「{result.reason}」</div>}
          <details>
            <summary>原始回复</summary>
            <pre>{result.raw}</pre>
          </details>
        </div>
      )}
      {result && !result.ok && <div className="ai-result warn">✗ {result.error}</div>}
    </div>
  );
}
