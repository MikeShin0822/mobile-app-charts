const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchJson(url, { attempts = 3, timeoutMs = 30000, headers = {} } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'user-agent': 'mobile-app-charts/1.0 (+https://github.com/MikeShin0822/mobile-app-charts)',
          ...headers,
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(1000 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
