// Accepts every era of the engine's provider-setup error: current engines say
// "No Work4You provider is configured", older ones said Wayne/Hermes. Desktop
// and engine update on separate channels, so all spellings must keep matching.
const PROVIDER_SETUP_ERROR_RE =
  /No (?:inference|Hermes|Wayne|Work4You) provider(?: is)? configured|no_provider_configured|OPENROUTER_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|set an API key/i

export function isProviderSetupErrorMessage(message: null | string | undefined): boolean {
  const text = message?.trim()

  if (!text) {
    return false
  }

  return PROVIDER_SETUP_ERROR_RE.test(text)
}
