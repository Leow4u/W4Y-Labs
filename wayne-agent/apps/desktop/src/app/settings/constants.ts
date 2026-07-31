import {
  Box,
  Brain,
  Globe,
  type IconComponent,
  Mic,
  Monitor,
  Moon,
  Palette,
  Sun,
  Wrench
} from '@/lib/icons'
import type { ThemeMode } from '@/themes/context'

import { defineFieldCopy } from './field-copy'
import type { DesktopConfigSection } from './types'

// Provider group definitions used to fold raw env-var names like
// ``XAI_API_KEY`` into a single "xAI" card with a friendly label, short
// description, and signup URL. Membership is determined by longest
// prefix match (see ``providerGroup`` in helpers.ts) so more specific
// prefixes (``MINIMAX_CN_``) correctly beat their general parents
// (``MINIMAX_``). New providers should be added here so they get their
// own card in Settings → Keys instead of being lumped into "Other".
interface ProviderPrefix {
  prefix: string
  name: string
  /** Optional one-line tagline shown beneath the group name. */
  description?: string
  /** Optional canonical signup/console URL surfaced from the card header. */
  docsUrl?: string
  /** Lower numbers float to the top of the providers list. */
  priority: number
}

export const EMPTY_SELECT_VALUE = '__hermes_empty__'
export const CONTROL_TEXT = 'text-xs'

export const PROVIDER_GROUPS: ProviderPrefix[] = [
  {
    prefix: 'NOUS_',
    name: 'Nous Portal',
    description: 'Hosted Hermes & Nous-trained models',
    docsUrl: 'https://portal.nousresearch.com',
    priority: 0
  },
  {
    prefix: 'OPENROUTER_',
    name: 'OpenRouter',
    description: 'Aggregator for hundreds of frontier models',
    docsUrl: 'https://openrouter.ai/keys',
    priority: 1
  },
  {
    prefix: 'ANTHROPIC_',
    name: 'Anthropic',
    description: 'Claude API access (Sonnet, Opus, Haiku)',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    priority: 2
  },
  {
    prefix: 'XAI_',
    name: 'xAI',
    description: 'Grok models (use OAuth for SuperGrok / Premium+)',
    docsUrl: 'https://console.x.ai/',
    priority: 3
  },
  {
    prefix: 'GOOGLE_',
    name: 'Gemini',
    description: 'Google AI Studio (Gemini 1.5 / 2.0 / 2.5)',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    priority: 4
  },
  { prefix: 'GEMINI_', name: 'Gemini', priority: 4 },
  {
    prefix: 'DEEPSEEK_',
    name: 'DeepSeek',
    description: 'Direct DeepSeek API (V3.x, R1)',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    priority: 5
  },
  {
    prefix: 'DASHSCOPE_',
    name: 'DashScope (Qwen)',
    description: 'Alibaba Cloud DashScope — Qwen and multi-vendor models',
    docsUrl: 'https://modelstudio.console.alibabacloud.com/',
    priority: 6
  },
  { prefix: 'HERMES_QWEN_', name: 'DashScope (Qwen)', priority: 6 },
  {
    prefix: 'GLM_',
    name: 'GLM / Z.AI',
    description: 'Zhipu GLM-4.6 and Z.AI hosted endpoints',
    docsUrl: 'https://z.ai/',
    priority: 7
  },
  { prefix: 'ZAI_', name: 'GLM / Z.AI', priority: 7 },
  { prefix: 'Z_AI_', name: 'GLM / Z.AI', priority: 7 },
  {
    prefix: 'KIMI_',
    name: 'Kimi / Moonshot',
    description: 'Moonshot Kimi K2 / coding endpoints',
    docsUrl: 'https://platform.moonshot.cn/',
    priority: 8
  },
  {
    prefix: 'KIMI_CN_',
    name: 'Kimi (China)',
    description: 'Moonshot China endpoint',
    docsUrl: 'https://platform.moonshot.cn/',
    priority: 9
  },
  {
    prefix: 'MINIMAX_',
    name: 'MiniMax',
    description: 'MiniMax-M2 and Hailuo international endpoints',
    docsUrl: 'https://www.minimax.io/',
    priority: 10
  },
  {
    prefix: 'MINIMAX_CN_',
    name: 'MiniMax (China)',
    description: 'MiniMax mainland China endpoint',
    docsUrl: 'https://www.minimaxi.com/',
    priority: 11
  },
  {
    prefix: 'HF_',
    name: 'Hugging Face',
    description: 'Inference Providers — 20+ open models via router.huggingface.co',
    docsUrl: 'https://huggingface.co/settings/tokens',
    priority: 12
  },
  {
    prefix: 'OPENCODE_ZEN_',
    name: 'OpenCode Zen',
    description: 'Pay-as-you-go access to curated coding models',
    docsUrl: 'https://opencode.ai/auth',
    priority: 13
  },
  {
    prefix: 'OPENCODE_GO_',
    name: 'OpenCode Go',
    description: '$10/month subscription for open coding models',
    docsUrl: 'https://opencode.ai/auth',
    priority: 14
  },
  {
    prefix: 'NVIDIA_',
    name: 'NVIDIA NIM',
    description: 'build.nvidia.com or your own local NIM endpoint',
    docsUrl: 'https://build.nvidia.com/',
    priority: 15
  },
  {
    prefix: 'OLLAMA_',
    name: 'Ollama Cloud',
    description: 'Cloud-hosted open models from ollama.com',
    docsUrl: 'https://ollama.com/settings',
    priority: 16
  },
  {
    prefix: 'LM_',
    name: 'LM Studio',
    description: 'Local LM Studio server (OpenAI-compatible)',
    docsUrl: 'https://lmstudio.ai/docs/local-server',
    priority: 17
  },
  {
    prefix: 'STEPFUN_',
    name: 'StepFun',
    description: 'StepFun Step Plan coding models',
    docsUrl: 'https://platform.stepfun.com/',
    priority: 18
  },
  {
    prefix: 'XIAOMI_',
    name: 'Xiaomi MiMo',
    description: 'MiMo-V2.5 and Xiaomi proprietary models',
    docsUrl: 'https://platform.xiaomimimo.com',
    priority: 19
  },
  {
    prefix: 'ARCEEAI_',
    name: 'Arcee AI',
    description: 'Arcee-hosted small + medium models',
    docsUrl: 'https://chat.arcee.ai/',
    priority: 20
  },
  { prefix: 'ARCEE_', name: 'Arcee AI', priority: 20 },
  {
    prefix: 'GMI_',
    name: 'GMI Cloud',
    description: 'GMI Cloud GPU + model serving',
    docsUrl: 'https://www.gmicloud.ai/',
    priority: 21
  },
  {
    prefix: 'AZURE_FOUNDRY_',
    name: 'Azure Foundry',
    description: 'Azure AI Foundry custom endpoints (OpenAI / Anthropic-compatible)',
    docsUrl: 'https://ai.azure.com/',
    priority: 22
  },
  {
    prefix: 'AWS_',
    name: 'AWS Bedrock',
    description: 'Authenticate via AWS profile + region',
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-regions.html',
    priority: 23
  }
]

export const BUILTIN_PERSONALITIES = [
  'helpful',
  'concise',
  'technical',
  'creative',
  'teacher',
  'kawaii',
  'catgirl',
  'pirate',
  'shakespeare',
  'surfer',
  'noir',
  'uwu',
  'philosopher',
  'hype'
]

/**
 * Popular Edge TTS Neural voices for the desktop picker. edge-tts exposes
 * ~300+ voices; Settings surfaces a curated set with human labels. Any value
 * already in config still appears via `enumOptionsFor`.
 */
export const EDGE_TTS_VOICES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'pt-BR-FranciscaNeural', label: 'Francisca — Português (Brasil)' },
  { id: 'pt-BR-AntonioNeural', label: 'Antônio — Português (Brasil)' },
  { id: 'pt-BR-ThalitaMultilingualNeural', label: 'Thalita — Português (Brasil, multilíngue)' },
  { id: 'pt-PT-RaquelNeural', label: 'Raquel — Português (Portugal)' },
  { id: 'pt-PT-DuarteNeural', label: 'Duarte — Português (Portugal)' },
  { id: 'en-US-AriaNeural', label: 'Aria — English (US)' },
  { id: 'en-US-JennyNeural', label: 'Jenny — English (US)' },
  { id: 'en-US-AvaNeural', label: 'Ava — English (US)' },
  { id: 'en-US-AndrewNeural', label: 'Andrew — English (US)' },
  { id: 'en-US-BrianNeural', label: 'Brian — English (US)' },
  { id: 'en-US-EmmaNeural', label: 'Emma — English (US)' },
  { id: 'en-US-GuyNeural', label: 'Guy — English (US)' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia — English (UK)' },
  { id: 'en-GB-RyanNeural', label: 'Ryan — English (UK)' },
  { id: 'es-ES-ElviraNeural', label: 'Elvira — Español (España)' },
  { id: 'es-ES-AlvaroNeural', label: 'Álvaro — Español (España)' },
  { id: 'es-MX-DaliaNeural', label: 'Dalia — Español (México)' },
  { id: 'es-MX-JorgeNeural', label: 'Jorge — Español (México)' }
]

export const EDGE_TTS_VOICE_IDS = EDGE_TTS_VOICES.map(voice => voice.id)

export const EDGE_TTS_VOICE_LABELS: Record<string, string> = Object.fromEntries(
  EDGE_TTS_VOICES.map(voice => [voice.id, voice.label])
)

// Schema-side select overrides for desktop-relevant enum fields whose
// backend schema only declares a string type.
export const ENUM_OPTIONS: Record<string, string[]> = {
  'agent.image_input_mode': ['auto', 'native', 'text'],
  'approvals.mode': ['manual', 'smart', 'off'],
  'code_execution.mode': ['project', 'strict'],
  'context.engine': ['compressor', 'default', 'custom'],
  'delegation.reasoning_effort': ['', 'minimal', 'low', 'medium', 'high', 'xhigh'],
  'memory.provider': ['', 'builtin', 'hindsight', 'honcho'],
  // Terminal execution backends — kept in sync with the dispatch ladder in
  // tools/terminal_tool.py::_create_environment (local/docker/singularity/
  // modal/daytona/ssh). Remote backends need extra env (image, tokens, host).
  'terminal.backend': ['local', 'docker', 'singularity', 'modal', 'daytona', 'ssh'],
  'stt.elevenlabs.model_id': ['scribe_v2', 'scribe_v1'],
  'stt.local.model': ['tiny', 'base', 'small', 'medium', 'large-v3'],
  // Speech-to-text backends — kept in sync with the stt block in
  // hermes_cli/config.py (local/groq/openai/mistral/elevenlabs).
  'stt.provider': ['local', 'groq', 'openai', 'mistral', 'xai', 'elevenlabs'],
  'tts.openai.voice': ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
  // Curated Edge Neural voices (edge-tts has ~300+; full catalog is overkill in
  // Settings). Current custom values still appear via enumOptionsFor merge.
  'tts.edge.voice': EDGE_TTS_VOICE_IDS,
  // Text-to-speech backends — kept in sync with the built-in source of truth
  // (agent/tts_registry.py::_BUILTIN_NAMES / tools/tts_tool.py::
  // BUILTIN_TTS_PROVIDERS). 'xai' is Grok TTS.
  'tts.provider': [
    'edge',
    'elevenlabs',
    'openai',
    'xai',
    'minimax',
    'mistral',
    'gemini',
    'neutts',
    'kittentts',
    'piper'
  ],
  'stt.openai.model': ['whisper-1', 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe'],
  'stt.mistral.model': ['voxtral-mini-latest', 'voxtral-mini-2602'],
  'tts.openai.model': ['gpt-4o-mini-tts', 'tts-1', 'tts-1-hd'],
  'tts.elevenlabs.model_id': ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5'],
  // NeuTTS local inference device.
  'tts.neutts.device': ['cpu', 'cuda', 'mps'],
  'updates.non_interactive_local_changes': ['stash', 'discard']
}

export const FIELD_LABELS: Record<string, string> = defineFieldCopy({
  model: 'Default Model',
  modelContextLength: 'Context Window',
  fallbackProviders: 'Fallback Models',
  toolsets: 'Enabled Toolsets',
  timezone: 'Timezone',
  display: {
    personality: 'Personality',
    showReasoning: 'Show Thinking'
  },
  agent: {
    maxTurns: 'Max Agent Steps',
    imageInputMode: 'Image Attachments',
    apiMaxRetries: 'API Retries',
    serviceTier: 'Service Tier',
    toolUseEnforcement: 'Tool-Use Enforcement'
  },
  terminal: {
    cwd: 'Working Directory',
    backend: 'Execution Backend',
    timeout: 'Command Timeout',
    persistentShell: 'Persistent Shell',
    envPassthrough: 'Environment Passthrough',
    dockerImage: 'Docker Image',
    singularityImage: 'Singularity Image',
    modalImage: 'Modal Image',
    daytonaImage: 'Daytona Image'
  },
  fileReadMaxChars: 'File Read Limit',
  toolOutput: {
    maxBytes: 'Terminal Output Limit',
    maxLines: 'File Page Limit',
    maxLineLength: 'Line Length Limit'
  },
  codeExecution: {
    mode: 'Code Execution Mode'
  },
  approvals: {
    mode: 'Approval Mode',
    timeout: 'Approval Timeout',
    mcpReloadConfirm: 'Confirm MCP Reloads'
  },
  commandAllowlist: 'Command Allowlist',
  security: {
    redactSecrets: 'Redact Secrets',
    allowPrivateUrls: 'Allow Private URLs'
  },
  browser: {
    allowPrivateUrls: 'Browser Private URLs',
    autoLocalForPrivateUrls: 'Local Browser For Private URLs'
  },
  checkpoints: {
    enabled: 'File Checkpoints',
    maxSnapshots: 'Checkpoint Limit'
  },
  voice: {
    recordKey: 'Voice Shortcut',
    maxRecordingSeconds: 'Max Recording Length',
    autoTts: 'Read Responses Aloud'
  },
  stt: {
    enabled: 'Speech To Text',
    echoTranscripts: 'Echo Transcripts',
    provider: 'Speech-To-Text Provider',
    local: {
      model: 'Local Transcription Model',
      language: 'Transcription Language'
    },
    openai: {
      model: 'OpenAI STT Model'
    },
    groq: {
      model: 'Groq STT Model'
    },
    mistral: {
      model: 'Mistral STT Model'
    },
    elevenlabs: {
      modelId: 'ElevenLabs STT Model',
      languageCode: 'ElevenLabs Language',
      tagAudioEvents: 'Tag Audio Events',
      diarize: 'Speaker Diarization'
    }
  },
  tts: {
    provider: 'Text-To-Speech Provider',
    edge: {
      voice: 'Edge Voice'
    },
    openai: {
      model: 'OpenAI TTS Model',
      voice: 'OpenAI Voice'
    },
    elevenlabs: {
      voiceId: 'ElevenLabs Voice',
      modelId: 'ElevenLabs Model'
    },
    xai: {
      voiceId: 'xAI (Grok) Voice',
      language: 'xAI Language'
    },
    minimax: {
      model: 'MiniMax TTS Model',
      voiceId: 'MiniMax Voice'
    },
    mistral: {
      model: 'Mistral TTS Model',
      voiceId: 'Mistral Voice'
    },
    gemini: {
      model: 'Gemini TTS Model',
      voice: 'Gemini Voice'
    },
    neutts: {
      model: 'NeuTTS Model',
      device: 'NeuTTS Device'
    },
    kittentts: {
      model: 'KittenTTS Model',
      voice: 'KittenTTS Voice'
    },
    piper: {
      voice: 'Piper Voice'
    }
  },
  memory: {
    memoryEnabled: 'Persistent Memory',
    userProfileEnabled: 'User Profile',
    memoryCharLimit: 'Memory Budget',
    userCharLimit: 'Profile Budget',
    provider: 'Memory Provider'
  },
  context: {
    engine: 'Context Engine'
  },
  compression: {
    enabled: 'Auto-Compression',
    threshold: 'Compression Threshold',
    targetRatio: 'Compression Target',
    protectLastN: 'Protected Recent Messages'
  },
  delegation: {
    model: 'Subagent Model',
    provider: 'Subagent Provider',
    maxIterations: 'Subagent Turn Limit',
    maxConcurrentChildren: 'Parallel Subagents',
    childTimeoutSeconds: 'Subagent Timeout',
    reasoningEffort: 'Subagent Reasoning Effort'
  },
  updates: {
    nonInteractiveLocalChanges: 'In-App Update Local Changes'
  }
})

export const FIELD_DESCRIPTIONS: Record<string, string> = defineFieldCopy({
  model: 'Used for new chats unless you pick a different model in the composer.',
  modelContextLength:
    'Maximum tokens this chat can keep in mind. 0 = use the official limit for the selected model.',
  fallbackProviders: 'Models to try next when the main model is down or errors out.',
  toolsets: 'Which built-in tool bundles the agent may use (CLI / messaging presets).',
  commandAllowlist: 'Patterns that can run without asking again (advanced).',
  display: {
    personality: 'Default assistant style for new sessions.',
    showReasoning:
      "Show the model's chain-of-thought when it shares it. Does not affect working status, timers, or tool progress."
  },
  timezone: 'Used when Work4You needs local time context. Blank uses the system timezone.',
  agent: {
    imageInputMode: 'How attached images are sent to the model.',
    maxTurns: 'Upper bound for tool-calling turns before Work4You stops a run.',
    apiMaxRetries: 'How many times to retry a failed model API call.',
    serviceTier: 'Optional provider service tier (OpenAI / Anthropic). Leave none for default.',
    toolUseEnforcement: 'How strictly the model must use tools when a turn expects them (auto / force / off).'
  },
  terminal: {
    cwd: 'Default project folder for tool and terminal work.',
    backend: 'Where shell commands run (local machine, Docker, cloud backends, …).',
    timeout: 'Seconds before a single terminal command is killed.',
    persistentShell: 'Keep shell state between commands when the backend supports it.',
    envPassthrough: 'Environment variables to pass into tool execution.',
    dockerImage: 'Container image used when the execution backend is Docker.',
    singularityImage: 'Image used when the execution backend is Singularity.',
    modalImage: 'Image used when the execution backend is Modal.',
    daytonaImage: 'Image used when the execution backend is Daytona.'
  },
  codeExecution: {
    mode: 'How strictly code execution is scoped to the current project.'
  },
  fileReadMaxChars: 'Maximum characters Work4You can read from one file request.',
  toolOutput: {
    maxBytes: 'Max bytes of a single tool/terminal result kept in context.',
    maxLines: 'Max lines kept from a long tool result.',
    maxLineLength: 'Max characters per line before truncation.'
  },
  approvals: {
    mode: 'How Work4You handles commands that need explicit approval.',
    timeout: 'Seconds to wait for your reply before an approval prompt expires.',
    mcpReloadConfirm: 'Ask for confirmation before reloading MCP connectors mid-session.'
  },
  security: {
    redactSecrets: 'Hide detected secrets from model-visible content when possible.'
  },
  checkpoints: {
    enabled: 'Create rollback snapshots before file edits.',
    maxSnapshots: 'How many file checkpoints to keep before older ones are dropped.'
  },
  memory: {
    memoryEnabled: 'Save durable memories that can help future sessions.',
    userProfileEnabled: 'Maintain a compact profile of user preferences.',
    memoryCharLimit: 'Approximate character budget for stored memory notes.',
    userCharLimit: 'Approximate character budget for the user profile.',
    provider: 'Where durable memory is stored. On this computer works offline.'
  },
  context: {
    engine: 'Strategy for managing long conversations near the context limit.'
  },
  compression: {
    enabled: 'Summarize older context when conversations get large.',
    threshold: 'How full the context window must be before compression runs (0–1).',
    targetRatio: 'How much of the window to free when compression runs (0–1).',
    protectLastN: 'Keep the last N messages intact when summarizing.'
  },
  delegation: {
    model: 'Which active model delegated subagents use. Empty inherits the parent chat model.',
    provider: 'API/credentials path for subagents. Set automatically when you pick a subagent model.',
    maxIterations: 'Max tool-calling turns for each subagent.',
    maxConcurrentChildren: 'How many subagents may run in parallel.',
    childTimeoutSeconds: 'Kill a subagent after this many seconds (0 = no limit).',
    reasoningEffort: 'Reasoning effort for delegated subagents.'
  },
  voice: {
    autoTts: 'Automatically speak assistant responses.'
  },
  tts: {
    xai: {
      voiceId: 'xAI voice ID (e.g. eve) or a custom voice ID.',
      language: 'Spoken language code, e.g. en.'
    },
    neutts: {
      device: 'Local inference device for NeuTTS.'
    }
  },
  stt: {
    enabled: 'Enable local or provider-backed speech transcription.',
    echoTranscripts: 'Post the raw 🎙️ transcript of voice messages back to the chat.',
    elevenlabs: {
      languageCode: 'Optional ISO-639-3 language code. Blank lets ElevenLabs auto-detect.'
    }
  },
  updates: {
    nonInteractiveLocalChanges:
      'When Work4You updates itself from the app (no terminal prompt), keep local source edits (stash) or throw them away (discard). Terminal updates always ask.'
  }
})

// Curated desktop config surface: only fields a user might tune from the app.
export const SECTIONS: DesktopConfigSection[] = [
  {
    id: 'model',
    label: 'Models',
    icon: Box,
    // The curated Models page is dedicated (ModelsSettings → MoA + runtime). Default
    // model is Composer write-through; subagent/context/fallback/images live
    // on ModelsRuntimeSettings (not listed here — that page reads schema keys
    // directly).
    keys: []
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    keys: []
  },
  {
    // Cursor-style Browser & Network — product differentiator, not Advanced.
    id: 'browser-network',
    label: 'Browser & Network',
    icon: Globe,
    keys: [
      'security.allow_private_urls',
      'browser.allow_private_urls',
      'browser.auto_local_for_private_urls'
    ]
  },
  {
    id: 'memory',
    label: 'Memory & Context',
    icon: Brain,
    // Curated surface — toggles + provider + summarize. Fine budgets/ratios stay in Advanced.
    keys: [
      'memory.memory_enabled',
      'memory.user_profile_enabled',
      'memory.provider',
      'compression.enabled'
    ]
  },
  {
    id: 'voice',
    label: 'Voice',
    icon: Mic,
    keys: [
      'tts.provider',
      'stt.enabled',
      'stt.provider',
      'voice.auto_tts',
      'tts.edge.voice',
      'tts.openai.model',
      'tts.openai.voice',
      'tts.elevenlabs.voice_id',
      'tts.elevenlabs.model_id',
      'tts.xai.voice_id',
      'tts.xai.language',
      'tts.minimax.model',
      'tts.minimax.voice_id',
      'tts.mistral.model',
      'tts.mistral.voice_id',
      'tts.gemini.model',
      'tts.gemini.voice',
      'tts.neutts.model',
      'tts.neutts.device',
      'tts.kittentts.model',
      'tts.kittentts.voice',
      'tts.piper.voice',
      'stt.local.model',
      // stt.local.language stays off the desktop Voice UI — empty = Whisper
      // auto-detect, which is the right default for most users; power users can still
      // set it in config.yaml.
      'stt.openai.model',
      'stt.groq.model',
      'stt.mistral.model',
      'stt.elevenlabs.model_id',
      // language_code: same as stt.local.language — auto-detect by default.
      'stt.elevenlabs.tag_audio_events',
      'stt.elevenlabs.diarize',
      // voice.record_key is CLI/TUI-only — desktop uses composer.voice keybinds.
      // stt.echo_transcripts is not in the config schema (messaging always echoes).
      'voice.max_recording_seconds'
    ]
  },
  {
    // Off the primary nav (see settings/index.tsx). Reachable via `?tab=config:advanced`.
    id: 'advanced',
    label: 'Advanced',
    icon: Wrench,
    keys: [
      // Security power knobs — the essentials live in General / Browser & Network.
      'approvals.timeout',
      'approvals.mcp_reload_confirm',
      'command_allowlist',
      // Memory budgets / fine compression — provider + summarize toggle live on Memory.
      'memory.memory_char_limit',
      'memory.user_char_limit',
      'context.engine',
      'compression.threshold',
      'compression.target_ratio',
      'compression.protect_last_n',
      // Workspace / terminal runtime knobs (project pick is composer/sidebar).
      'terminal.cwd',
      'code_execution.mode',
      'terminal.persistent_shell',
      'terminal.env_passthrough',
      'file_read_max_chars',
      'terminal.backend',
      'terminal.timeout',
      'terminal.docker_image',
      'terminal.singularity_image',
      'terminal.modal_image',
      'terminal.daytona_image',
      'tool_output.max_bytes',
      'tool_output.max_lines',
      'tool_output.max_line_length',
      // Agent limits — subagent model/provider/effort + images live on Models;
      // in-app update local-changes preference lives on About.
      'checkpoints.max_snapshots',
      'agent.max_turns',
      'agent.image_input_mode',
      'agent.api_max_retries',
      'agent.service_tier',
      'agent.tool_use_enforcement',
      'delegation.max_iterations',
      'delegation.max_concurrent_children',
      'delegation.child_timeout_seconds'
    ]
  }
]

/** Permission essentials shown under Settings → General (not a Safety nav item). */
export const GENERAL_PERMISSION_KEYS = [
  'approvals.mode',
  'security.redact_secrets',
  'checkpoints.enabled'
] as const

/** Option labels for agent.image_input_mode (fallback if i18n missing). */
export const IMAGE_INPUT_MODE_LABELS: Record<string, string> = {
  auto: 'Recommended — decide for this model',
  native: 'Send the photo as an image',
  text: 'Describe the photo as text first'
}

export interface ModeOption {
  id: ThemeMode
  label: string
  icon: IconComponent
}

export const MODE_OPTIONS: ModeOption[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor }
]
