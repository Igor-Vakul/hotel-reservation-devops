# Hotel Reservation — Cloud-Native DevOps

A 3-tier hotel-reservation application taken all the way from source code to a GitOps-delivered,
observable Kubernetes deployment. Each part is layered on top of the previous one without breaking
the application's contract.

**Exam brief** by [Yakir Bar](https://github.com/YakirBar) —
[lh-devops-project](https://github.com/YakirBar/lh-devops-project-/blob/main/README.md).
The requirements below are his; the implementation is mine.

---

# PART I — The exam (required by the brief)

## What was required

| # | Topic | Requirement |
|---|-------|-------------|
| 1 | **3-tier application** | Frontend + backend + database, independently deployable |
| 2 | **Docker + Kubernetes** | Own image registry (**Nexus**), replicas **5 / 5 / 3**, **PersistentVolume**, **ConfigMaps**, **Secrets** |
| 3 | **CI (GitHub Actions)** | Build, test and scan images on every change; push to a registry |
| 4 | **CD (ArgoCD / GitOps)** | Auto-deploy manifests from git into the cluster |
| **Bonus 1** | **Observability** | Prometheus + Loki + Grafana |

## What was delivered

| Part | Status | Delivered |
|------|:------:|-----------|
| 1. Application | ✅ | .NET 10 Minimal API + EF Core, Angular 22, MySQL 8 |
| 2. Docker + Kubernetes | ✅ | minikube + Kustomize, Nexus, **5/5/3**, MySQL replication, PV/Config/Secrets, Ingress |
| 3. CI | ✅ | GitHub Actions: tests + Trivy/audit scans + push to GHCR |
| 4. CD | ✅ | ArgoCD GitOps: auto-sync + self-heal + prune |
| **Bonus 1** — Observability | ✅ | Prometheus + Grafana + Loki, app `/metrics`, dashboards |

### 1. Application (3 tiers)

- **Backend** — .NET 10 Minimal API + EF Core (Pomelo MySQL). REST API for hotels, rooms and
  reservations, JWT auth, roles (`admin` / `client`), Serializable-transaction booking with per-room
  and per-user date-overlap validation. Exposes `/health` and Prometheus `/metrics`.
- **Frontend** — Angular 22 (standalone components + signals), served by nginx which proxies `/api`
  to the backend.
- **Database** — MySQL 8 (+ phpMyAdmin). Local development is wired with Docker Compose.

### 2. Docker + Kubernetes (`k8s/`)

- **Kustomize**: `base` + `overlays/prod` + `overlays/dev`.
- **Nexus** running in-cluster as a private Docker registry.
- Replicas **5 / 5 / 3** — backend ×5, frontend ×5, **MySQL 3-node replication** (Bitnami
  StatefulSet: 1 primary + 2 secondaries, one PVC per pod).
- **PersistentVolumes** (Nexus, MySQL), **ConfigMap** (`hotel-config`) + **Secret** (`hotel-secret`).
- EF Core migrations run once from a dedicated **Job** — the 5 backend replicas never race each other.
- **Ingress** (`hotel.local`) fronts the frontend.

### 3. CI — GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))

- **backend** — `dotnet test` (xUnit) + `dotnet list package --vulnerable`.
- **frontend** — Vitest + `npm audit`.
- **images** — build + **Trivy** scan + push to **GHCR**
  (`ghcr.io/igor-vakul/hotel-{backend,frontend}`), authenticated with the built-in `GITHUB_TOKEN`.
  `main` publishes `:latest`, `dev` publishes `:dev`; feature branches only build and scan.

### 4. CD — ArgoCD GitOps (`k8s/argocd/`)

- Application `hotel` tracks `k8s/overlays/prod` on **`main`** → namespace `hotel`.
- Application `hotel-dev` tracks `k8s/overlays/dev` on **`dev`** → namespace `hotel-dev`.
- **automated + self-heal + prune**: git is the single source of truth — a push auto-deploys, manual
  cluster edits get reverted, resources removed from git get pruned.

### Bonus 1 — Observability (this one WAS part of the brief)

- **kube-prometheus-stack** (Prometheus + Grafana) and **Loki + Promtail**, both deployed by ArgoCD.
- The backend emits Prometheus metrics (`prometheus-net`), scraped through a **ServiceMonitor**;
  Grafana dashboards for the application and the cluster.

> **Registry note:** the brief specified Nexus, and Part 2 runs Nexus in-cluster. Parts 3–4 use
> **GHCR** because GitHub-hosted CI runners cannot reach a Nexus living inside a local minikube —
> the realistic cloud-side choice. A registry only earns its keep if it sits where *both* the builder
> and the cluster can see it.
> That left Nexus running but unused, which the `dev` branch fixes by pointing it the other way round
> — see **C4.5 / C4.6** below.

---

# PART II — Bonus 2: beyond the brief (branch `dev`)

None of the following was required by the brief. It is the work done after the exam scope was
complete, on the `dev` branch (deployed by ArgoCD into the `hotel-dev` namespace).

## ✅ Done

| | Topic | What it adds |
|---|---|---|
| **C1** | **Backups & restore** | `CronJob` → nightly `mysqldump --single-transaction` (consistent snapshot, no table locks) → gzipped dump on a dedicated PVC, with rotation. Written **atomically** (temp file + `mv`) plus a size sanity check, so a failed dump can never publish an empty file that a later restore would happily replay. The restore Job is deliberately kept **out** of the GitOps sync loop — otherwise ArgoCD would re-run it on every sync and overwrite a live database. Restore was drilled for real: `DROP DATABASE` → restore → data back. |
| **C2** | **Alerting** | Alertmanager (Telegram + email) driven by a `PrometheusRule` with two rules: *the backup Job failed* (cause) and *no successful backup in 25 h* (symptom). The second one matters most: a suspended or deleted CronJob produces no failed Job at all, so a cause-based rule would stay silent while backups quietly stop existing. Noisy default `kube-system` alerts are routed to a null receiver — alert fatigue is a failure mode in itself. |
| **C3** | **Autoscaling** | `HorizontalPodAutoscaler` on the backend (CPU at 50 % of requests, 1 → 5), with an asymmetric `behavior`: scale up immediately, scale down only after a 5-minute stabilization window. ArgoCD is told to `ignoreDifferences` on `/spec/replicas` (+ `RespectIgnoreDifferences`) — otherwise self-heal and the HPA fight over the same field, killing pods mid-request. |
| **C4** | **Secrets in git** | **Sealed Secrets**: a Secret is encrypted with the controller's public key and committed as a `SealedSecret` (`k8s/sealed/`). Only this cluster holds the private key, so the ciphertext is safe even in a public repository. `hotel-secret`, `ghcr-cred`, the Telegram bot token and the SMTP password now live in git — encrypted — instead of being applied by hand on every machine. |
| **C4.5** | **The registry actually used** | Part 2 ran Nexus in-cluster because the brief asked for one, but nothing pulled from it — images came straight from GHCR. Rather than exposing Nexus to the internet (which would make a laptop part of the CI path), it was turned around into a **pull-through proxy** for `ghcr.io`: the cluster asks Nexus, Nexus fetches once from GHCR with its own PAT, caches the layers and serves every later pull locally. The GitHub credentials now live **inside the registry**, so the cluster no longer needs any. |
| **C4.6** | **Docker Hub cache** | A second proxy repository for `registry-1.docker.io`, both fronted by a Nexus **group** on one port, so a single address covers both upstreams. This matters more than the GHCR proxy: Docker Hub rate-limits anonymous pulls (~100 per 6 h per IP), and one CI or one office behind a single egress IP hits `429 Too Many Requests` at the worst possible moment. Every image in the dev environment now comes through the cache. |
| **C5** | **Runtime hardening** | `securityContext` across the workloads: backend and frontend run **non-root with a read-only root filesystem, all Linux capabilities dropped, `allowPrivilegeEscalation: false` and the default seccomp profile**; the frontend was moved to `nginxinc/nginx-unprivileged` (port 8080) so it needs no root at all, with writes redirected to small `emptyDir` mounts. phpMyAdmin keeps root (its image needs it) but stripped down to the **four** capabilities Apache actually uses. `LimitRange` + `ResourceQuota` give every pod sane request/limit defaults and cap the namespace as a whole; a `PodDisruptionBudget` (`maxUnavailable: 1`) keeps a node drain from evicting every replica at once. |

## 🚧 Planned / not done yet

| | Topic | Why |
|---|---|---|
| **C5.4** | NetworkPolicy | The one piece of hardening left: by default **any pod can reach any other pod, across namespaces**, so dev's phpMyAdmin can reach the production database. A namespace is a folder, not a wall. Enforcing it needs a CNI that supports policies (`--cni=calico`), which means recreating the cluster — so it pairs naturally with C6. |
| **C6** | Ansible bootstrap | The cluster itself is still built by hand from a runbook. Ansible would own Day 0 (docker → minikube → addons → ArgoCD → one root manifest) and then get out of the way — ArgoCD takes over from there. |
| **C7** | Progressive delivery | Argo Rollouts: canary releases with automatic analysis against Prometheus metrics and automatic rollback. This is where CI, CD and observability finally close into a loop. |
| — | **app-of-apps** | The ArgoCD `Application` objects themselves are still applied by hand (`kubectl apply -f k8s/argocd/...`). A single root Application watching that directory would reduce the bootstrap to exactly one manual step. |
| — | MySQL under GitOps | MySQL is still installed with `helm install` because its values held plaintext passwords. Sealed Secrets removes that obstacle (`auth.existingSecret`), so it can now move into git. It is also the one workload still pulling its image straight from Docker Hub, for the same reason: its image is pinned in a values file that lives outside git, where Kustomize cannot reach it. |
| — | Sealed secrets for prod | A `SealedSecret` is sealed for one specific namespace, so the `hotel` namespace needs its own sealed copies. |

---

---

# Running it

## Quickstart (local, Docker Compose — Part 1 only)

```bash
cp .env.example .env      # then fill in the values
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:8090 |
| phpMyAdmin | http://localhost:8081 |
| Backend API | http://localhost:5000 |

`.env` is git-ignored; `.env.example` is the template.

## Full stack on Kubernetes — from scratch

Step-by-step, every command: **[SETUP.md](SETUP.md)** — cluster, secrets, MySQL, ArgoCD, access,
and the beyond-exam extras (Sealed Secrets, backups, alerts, autoscaling).

The cluster is local (minikube) and is rebuilt from scratch on each machine — it is not in git.
Real secrets are **never** committed: `k8s/base/secrets/secret.example.yaml` and
`k8s/mysql/values.example.yaml` are templates. On `dev` this is replaced by Sealed Secrets, which
keeps the *encrypted* secrets in git itself.
