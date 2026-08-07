const baseUrl = (process.env.UPTIME_URL ?? 'https://www.housingnavigator.us')
  .replace(/\/$/, '');

const routes = ['/', '/login', '/resources'];
const requiredHeaders = {
  'content-security-policy': ["default-src 'self'", 'frame-ancestors \'none\''],
  'strict-transport-security': ['max-age=31536000'],
  'x-content-type-options': ['nosniff'],
};
const indexNowKey = 'e060bb774e804994906a00517eb1de56';

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

async function checkTextAsset(pathname, expectedPattern) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      Accept: 'text/plain',
      'User-Agent': 'HousingNavigator-Uptime/1.0',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.text()).trim();
  if (!response.ok || !expectedPattern.test(body)) {
    throw new Error(`${pathname} did not return the expected production marker`);
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

try {
  await checkTextAsset(`/${indexNowKey}.txt`, new RegExp(`^${indexNowKey}$`));
  await checkTextAsset(
    '/.well-known/housing-navigator-deploy.txt',
    /^[0-9a-f]{40}$/i,
  );
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

if (failures.length > 0) {
  console.error(`Production health check failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Housing Navigator is healthy at ${baseUrl}`);
}
