# Credentials and connection details

Copy `.env.example` to the repository root `.env` and keep real values out of Git, browser code, packages and chat. The API loads that file on startup. Restart it after configuration changes.

## NVIDIA reasoning

`NVIDIA_BASE_URL`, `NVIDIA_MODEL`, `NVIDIA_API_KEY` and `NVIDIA_ACCOUNT_REFERENCE` must identify the same endpoint/model/account as the reviewed provider authorization. The account reference is an operator-chosen stable identifier, not a second secret. `NVIDIA_SESSION_BUDGET_USD=0` documents the current budget; raising it does not raise the server's hardcoded approved ceiling. Key presence is not proof of free access. See [authorization](provider-authorization.md).

## Meterless

The pinned H-MEM implementation runs locally and requires no key. Its registry, trust evidence and retrieval records live under ignored `artifacts/library/`. No Meterless Nightshift service is configured. An integration claim about Nightshift would require separate implementation and evidence.

## Zetaris

An AWS account ID belongs to cloud provisioning and is not an Ember Forge credential. The managed deployment's Gateway/client endpoint and organisation credentials belong to the application layer. A connected AWS account is not a running cluster.

For the documented SaaS REST route, the [official authentication guide](https://kbase.zetaris.com/knowledge/accessing-zetaris-using-api) lists an organisation ID, username/password and console API key. `.env.example` includes `ZETARIS_BASE_URL`, `ZETARIS_ORG_ID`, `ZETARIS_USERNAME`, `ZETARIS_PASSWORD` and `ZETARIS_API_KEY` as placeholders. Confirm the actual deployment's API contract rather than assuming a Cloud Gateway sign-in URL is the query endpoint.

The downloaded local bundle documents its own JDBC driver, URL `jdbc:zetaris:lightning@localhost:10000`, and local platform login. Its REST and JDBC authentication can differ from SaaS. The current typed tenant transport still needs an implementation against that exact deployment and approved source mappings. Merely filling the environment cannot enable it.

The user extracted the official bundle at `D:/zetaris-platform/zetaris-platform`. Docker Desktop was started through its CLI; its engine reported 12 CPUs and 14,578,446,336 bytes of memory. No existing Zetaris volumes were found. The initial image pull failed with registry authentication required; no stack was started at that point. Use the private image-registry sign-in from the signed-in download page, never a password copied into source. The local override `.local/zetaris-compose.override.yml` binds the UI to loopback; start/stop commands must use that override and project name `ember-forge-zetaris` consistently.

The Cloud Gateway showed no compute clusters and warned that AWS resources bill separately, including some charges during suspension. No AWS cluster was created. The [managed AWS guide](https://github.com/zetaris/getting-started/blob/main/docs/install/managed-aws-cluster-guide.md) explains the separate AWS costs and application connection details.

## Local connection confirmed — 26 October

The user subsequently completed local Docker startup under Compose project `zetaris`. Postgres, driver, API and UI reported healthy; init and bootstrap exited 0. The UI is **http://localhost:3000**, not HTTPS on that port. `pnpm zetaris:configure --bundle 'D:/zetaris-platform/zetaris-platform'` authenticated locally and updated only Zetaris settings in the ignored repository `.env`, preserving all NVIDIA settings. The local route uses login credentials and the returned organisation ID; the placeholder SaaS API key was cleared. No login token was persisted or printed.

`pnpm zetaris:probe` verified the downloaded bundle's documented constant `select 7 as seven` through `/api/auth/login` and `/api/proxy/query/sql/start`. Sanitized evidence is `artifacts/zetaris/connectivity-c04557bd-8fbb-4bb8-b80d-dc1bf5c28bb3.json`. This is genuine local connectivity evidence, not a two-source query, stock reconciliation, or an enabled production tenant transport.

NVIDIA's endpoint/model/key/account fields were present and non-placeholder, the endpoint URL format was valid HTTPS and the informational budget remained 0. Credentials were **not** authenticated with NVIDIA; no provider call was made and no enabled provider authorization record was present.

Helper commands for the actual local project (Status reads only; Start/Stop change local containers and preserve volumes):

```powershell
pnpm zetaris:local -Action Status -BundlePath 'D:/zetaris-platform/zetaris-platform'
pnpm zetaris:local -Action Start -BundlePath 'D:/zetaris-platform/zetaris-platform'
pnpm zetaris:local -Action Stop -BundlePath 'D:/zetaris-platform/zetaris-platform'
```

The helper includes the loopback UI override. The user's original startup exposed UI port 3000 on all interfaces; it has not been recreated here. The Start/Stop helper itself has static review only and has not been exercised.

## Stock source reads and host credentials — current

Local stock reads are now implemented using the official JDBC jar and a Java source-file bridge. `ZETARIS_JDBC_URL`, `ZETARIS_JDBC_DRIVER_JAR`, `ZETARIS_USERNAME` and `ZETARIS_PASSWORD` are used server-side. JDK 25.0.2 was verified locally. The server-owned `.local/zetaris-stock-sources.json` maps four tables across two independently registered synthetic PostgreSQL databases. No new AWS credential or Meterless key is needed. The earlier constant SELECT is superseded by actual stock-read, cross-source join and freshness evidence; see [host/source verification](host-and-zetaris-verification.md).

Codex used its existing ChatGPT sign-in. Claude Code used an ephemeral loopback bridge to the already-authorized free NVIDIA endpoint because the inherited Ollama endpoint could not serve its default Claude model. No Anthropic API key was added, no global host configuration was changed, and the temporary bridge was stopped after verification. The exported procedure itself remains Node-only and model-free for supported inputs.
