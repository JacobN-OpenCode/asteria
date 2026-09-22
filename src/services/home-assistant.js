export function createHomeAssistantService({ getSettings, logger }) {
  function currentSettings() {
    return (getSettings && getSettings()) || {};
  }

  function isConfigured() {
    const { home_assistant_url: baseUrl, home_assistant_token: token, home_assistant_steps_entity: stepsEntity } =
      currentSettings();
    return Boolean(baseUrl && token && stepsEntity);
  }

  /**
   * Fetch the current step count from Home Assistant.
   * @returns {Promise<{ configured: boolean, steps: number | null, entity: string | null, error?: string }>}
   */
  async function fetchSteps() {
    const { home_assistant_url: baseUrl, home_assistant_token: token, home_assistant_steps_entity: stepsEntity } =
      currentSettings();
    const normalizedBaseUrl = (baseUrl || '').replace(/\/+$/, '');

    if (!normalizedBaseUrl || !token || !stepsEntity) {
      return { configured: false, steps: null, entity: null };
    }

    try {
      const response = await fetch(`${normalizedBaseUrl}/api/states/${encodeURIComponent(stepsEntity)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          configured: true,
          steps: null,
          entity: stepsEntity,
          error: `Home Assistant returned HTTP ${response.status}`,
        };
      }

      const body = await response.json();
      const rawSteps = Number.parseFloat(body?.state ?? '');

      if (!Number.isFinite(rawSteps)) {
        return {
          configured: true,
          steps: null,
          entity: stepsEntity,
          error: `Entity "${stepsEntity}" had no numeric state`,
        };
      }

      return { configured: true, steps: Math.round(rawSteps), entity: stepsEntity };
    } catch (error) {
      return {
        configured: true,
        steps: null,
        entity: stepsEntity,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    isConfigured,
    fetchSteps,
  };
}