export const XI_SPEECH_DOMAIN = "xi-speech";

/** 与 scripts/chunker/split.py 的 300–800 / 无 overlap 策略对应。 */
export const CHUNK_POLICY_VERSION = "python-split-300-800-v1";

/** 当前运行时 Canonical 快照：cleaned 75 篇，去重后 63 篇，已发布 447 Chunk。 */
export const CORPUS_VERSION = "xi-speech-canonical-runtime-63";

export const EXPECTED_CLEANED_DOCUMENT_COUNT = 75;
export const EXPECTED_RUNTIME_DOCUMENT_COUNT = 63;
export const EXPECTED_RUNTIME_CHUNK_COUNT = 447;

export const HINT_RULE_VERSION = "xi-speech-theme-hints-v1";
export const PROFILE_PROMPT_VERSION = "xi-speech-profile-v1";
export const RERANK_PROMPT_VERSION = "xi-speech-rerank-v1";
export const ASSET_PROMPT_VERSION = "xi-speech-assets-v1";
export const MATERIAL_PROMPT_VERSION = "xi-speech-material-v1";
