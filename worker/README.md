# Bot Browser - Cloudflare Worker Custom Proxy

This directory contains a lightweight Cloudflare Worker script that acts as a secure, fast CORS proxy for the SillyTavern Bot Browser extension.

By deploying your own proxy, you avoid rate limits and stability issues associated with public proxies like `corsproxy.io` or `Puter`. Your API requests (including authentication tokens) will only pass through your personal Cloudflare account, offering greater privacy.

## Prerequisites

1. A [Cloudflare](https://dash.cloudflare.com/sign-up) account (Free tier is perfectly fine; it gives you 100,000 requests/day).
2. [Node.js](https://nodejs.org/) installed on your computer.

## Deployment Instructions

### 1. Install Dependencies

Open your terminal/command prompt in this `worker` folder and run:

```bash
npm install
```

### 2. Login to Cloudflare

```bash
npx wrangler login
```

This will open your web browser. Authorize Wrangler to access your Cloudflare account.

### 3. Deploy the Worker

```bash
npx wrangler deploy
```

Once the deployment finishes, Wrangler will output a URL that looks like this:
`https://sillytavern-botbrowser-proxy.<your-username>.workers.dev`

### 4. Configure Bot Browser

1. Copy the URL generated in the previous step.
2. Open SillyTavern and go to the Bot Browser extension Settings.
3. Scroll down to the **Cloudflare Proxy** section (near the bottom).
4. Paste the URL into the **Custom Proxy URL** field.
5. Click **Save Settings**.

You're done! Bot Browser will now seamlessly use your personal, private proxy. If the custom proxy ever fails or stops working for any reason, the extension will automatically fall back to public proxies to ensure uninterrupted service.

## Local Development & Testing

If you are developing or modifying the worker code:

```bash
npx wrangler dev
```

This will start a local development server, usually at `http://localhost:8787` or similar. You can put this address into the Custom Proxy URL field in the Bot Browser settings to instantly test your changes without deploying.
