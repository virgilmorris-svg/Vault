# VPS Deployment

This deploys the API and MongoDB with Docker Compose, and uses Caddy to provide HTTPS at `https://vault54500.duckdns.org`. MongoDB is only reachable on the private Compose network.

## Prepare the VPS

- Install Docker Engine with the Docker Compose plugin.
- Allow inbound TCP ports 80 and 443 in the VPS firewall and provider firewall. Keep your SSH access allowed.
- Copy this project to the VPS.

## Configure and start

From the project directory on the VPS:

```sh
cp .env.example .env
openssl rand -hex 32
```

Edit `.env`: set `JWT_SECRET` to the generated random value and `EMERGENT_LLM_KEY` to your valid Emergent key. Do not commit or share `.env`.

Then start the stack:

```sh
docker compose up -d --build
docker compose ps
curl -fsS https://vault54500.duckdns.org/health
```

The health check should return `{"status":"ok"}`. Caddy obtains and renews the HTTPS certificate automatically once DNS resolves to this VPS and ports 80 and 443 are reachable.

## Build the app

The `preview` and `production` EAS profiles already point to this API. From `frontend/`, build the Android app with:

```sh
eas build --platform android --profile preview
```

Use the `production` profile for the Play Store release. Rebuild the app after changing the API URL.

## Operations

```sh
docker compose logs -f backend caddy
docker compose pull
docker compose up -d --build
```

Back up the `mongo_data` Docker volume regularly. Do not publish MongoDB's port to the Internet.