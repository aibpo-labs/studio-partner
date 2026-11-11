// Public Voice PaaS contract adapter. UI-only fields never enter CustomConfig.
export function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}
export function resourceRef(value) {
  const id = String(value?.id || ''), version = String(value?.version || '');
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(id) || !/^[A-Za-z0-9_.-]{1,64}$/.test(version))
    throw httpError('资源标识和版本须为 1–64 位字母、数字、下划线、点或连字符');
  return { id, version };
}
export function normalizeSkill(skill) {
  const result = { ...resourceRef(skill), preload: !!skill.preload };
  // Existing references stay references; never replace unread resources with empty content.
  if (typeof skill.markdown === 'string') result.markdown = skill.markdown;
  else if (typeof skill.content === 'string') {
    result.markdown = /^---\r?\n/.test(skill.content) ? skill.content :
      `---\nname: ${JSON.stringify(skill.name || skill.id)}\ndescription: ${JSON.stringify(skill.description || skill.name || skill.id)}\n---\n${skill.content}`;
  }
  for (const key of ['resources', 'required_tools']) if (skill[key] !== undefined) result[key] = skill[key];
  return result;
}
export function skillView(skill) {
  const value = normalizeSkill(skill), markdown = value.markdown || '';
  const metadata = key => {
    const front = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || '';
    const raw = front.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1] || '';
    try { return JSON.parse(raw); } catch { return raw.replace(/^['"]|['"]$/g, ''); }
  };
  return { ...value, name: skill.name || metadata('name') || skill.id,
    description: skill.description || metadata('description'), content: markdown,
    referenceOnly: !Object.hasOwn(value, 'markdown') };
}
export function channelConfig(input = {}, previous = {}) {
  const result = { ...previous };
  if (Object.hasOwn(input, 'greeting')) {
    if (typeof input.greeting !== 'string' || input.greeting.length > 2000) throw httpError('开场白最多 2000 字');
    result.greeting = input.greeting;
  }
  if (Object.hasOwn(input, 'idle_timeout_ms')) {
    const n = Number(input.idle_timeout_ms);
    if (!Number.isInteger(n) || (n !== 0 && (n < 3000 || n > 60000))) throw httpError('无回应提醒须为 3000–60000 ms，或 0 使用默认值');
    result.idle_timeout_ms = n;
  }
  return result;
}
export function draftConfig(current, input) {
  const config = { ...current };
  for (const field of ['name','instructions','llm','asr','tts','asr_language','tts_language','voice','temperature','max_tokens','silence_duration_ms','mcp_refs','tools'])
    if (Object.hasOwn(input, field)) config[field] = input[field];
  config.skills = (input.skills ?? current.skills ?? []).map(normalizeSkill);
  config.knowledge_refs = (input.knowledge_refs ?? current.knowledge_refs ?? []).map(resourceRef);
  // greeting/idle timeout belong to the channel, not the published model contract.
  delete config.greeting; delete config.idle_timeout_ms;
  return config;
}
export function checkLanguages(config, catalog) {
  for (const kind of ['asr', 'tts']) {
    const language = config[`${kind}_language`];
    if (language && !catalog.components?.find(c => c.kind === kind && c.id === config[kind])?.languages?.includes(language))
      throw httpError(`${kind.toUpperCase()} 不支持语言 ${language}，请从当前服务目录选择`);
  }
}
export function credentialRequest(runtime) {
  // Published prompt, voice, languages, skills and knowledge are inherited unchanged.
  return { model: runtime.model, from: 'studio-partner', ...channelConfig(runtime.channel), allow_mcp_tools: false };
}
