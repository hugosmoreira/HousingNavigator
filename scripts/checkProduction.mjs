const baseUrl = (process.env.UPTIME_URL ?? 'https://www.housingnavigator.us')
  .replace(/\/$/, '');

const routes = ['/', '/login', '/resources'];
const requiredHeaders = {
  'content-security-policy': ["default-src 'self'", 'frame-ancestors \'none\''],
  'strict-transport-security': ['max-age=31536000'],
  'x-content-type-options': ['nosniff'],
};

async function checkRoute(pathname) {
  const url = `${baseUrl}${pathname}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'HousingNavigator-Uptime/1.0',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`${pathname} returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('text/html')) {
    throw new Error(`${pathname} returned unexpected content-type ${contentType}`);
  }

  const body = await response.text();
  if (!body.includes('id="root"') || !body.includes('<title>')) {
    throw new Error(`${pathname} did not return the Housing Navigator app shell`);
  }

  for (const [header, requiredValues] of Object.entries(requiredHeaders)) {
    const value = response.headers.get(header) ?? '';
    for (const requiredValue of requiredValues) {
      if (!value.toLowerCase().includes(requiredValue.toLowerCase())) {
        throw new Error(`${pathname} is missing ${header}: ${requiredValue}`);
      }
    }
  }

  console.log(`OK ${pathname} ${response.status}`);
}

const failures = [];
for (const route of routes) {
  try {
    await checkRoute(route);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

if (failures.length > 0) {
  console.error(`Production health check failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Housing Navigator is healthy at ${baseUrl}`);
}
