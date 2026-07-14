# Setup — from an empty machine to a running cluster

Every step has the same shape:

> **What** — one line. **Run** — the command. **Check** — how you know it worked.

The cluster is local (minikube) and is **not** in git — it is rebuilt from scratch on each machine.
Real secrets are never committed; only `*.example.yaml` templates are.
Commands are PowerShell (Windows); on Linux/macOS only the path separators differ.

---

## Step 0 — What you need installed

**What:** Docker runs the cluster, `kubectl` talks to it, `helm` installs third-party charts,
`minikube` creates the cluster itself. You also need a GitHub token, because the container images
live in a private registry (GHCR).

**Run:**
```powershell
docker -v ; kubectl version --client ; helm version ; minikube version
```

**Check:** each command prints a version. Docker Desktop must be **running**.

---

# PART A — the exam (branch `main`)

## Step 1 — Try the app without Kubernetes (optional, 2 minutes)

**What:** Docker Compose starts the three tiers (frontend, backend, MySQL) on your laptop. This is
the application before any Kubernetes is involved — useful to see that it works at all.

**Run:**
```powershell
cp .env.example .env      # then open .env and fill in the values
docker compose up --build
```

**Check:** http://localhost:8090 opens the app; http://localhost:8081 opens phpMyAdmin.

Stop it with `Ctrl+C` before moving on — Kubernetes will use the same ports.

---

## Step 2 — Create the cluster

**What:** minikube starts a single-node Kubernetes cluster inside a Docker container.

**Run:**
```powershell
minikube start --driver=docker --insecure-registry="192.168.49.0/24" --cpus=4 --memory=8192
```

**Check:**
```powershell
kubectl get nodes        # minikube   Ready   control-plane
```

> `--insecure-registry` can only be set **when the cluster is created**. It allows pulling images
> over plain HTTP from the Nexus registry that runs inside the cluster.

---

## Step 3 — Turn on the two addons

**What:** `ingress` installs the reverse proxy that exposes the app by hostname.
`metrics-server` collects CPU/RAM usage — the autoscaler (branch `dev`) cannot work without it.

**Run:**
```powershell
minikube addons enable ingress
minikube addons enable metrics-server
```

**Check:**
```powershell
kubectl get pods -n ingress-nginx     # ingress-nginx-controller ... 1/1 Running
kubectl top nodes                     # prints CPU/RAM numbers (may take ~1 minute to appear)
```

---

## Step 4 — Create the namespaces

**What:** a namespace is a folder inside the cluster. `hotel` = production, `hotel-dev` = the dev
environment (optional).

**Run:**
```powershell
kubectl create namespace hotel
kubectl create namespace hotel-dev
```

**Check:** `kubectl get ns` lists both.

---

## Step 5 — Create the secrets (these are NOT in git)

**What:** two secrets. `hotel-secret` holds the DB connection string, the JWT signing key and the
bootstrap admin password. `ghcr-cred` is the login the cluster uses to pull the private images.

**Run:**
```powershell
# 1. application secret — copy the template and fill in real values
Copy-Item k8s/base/secrets/secret.example.yaml k8s/base/secrets/secret.yaml
#    open secret.yaml: Jwt__Secret must be at least 32 characters
kubectl apply -f k8s/base/secrets/secret.yaml

# 2. registry credentials (PAT needs the read:packages scope)
kubectl create secret docker-registry ghcr-cred -n hotel `
  --docker-server=ghcr.io --docker-username=<github-user> --docker-password=<PAT>
```

**Check:**
```powershell
kubectl get secret -n hotel      # hotel-secret + ghcr-cred
```

Repeat both commands with `-n hotel-dev` if you want the dev environment.

> On branch `dev` this step disappears completely: the secrets live in git as **SealedSecret**
> objects (encrypted) and are recreated automatically — see Step 10.

---

## Step 6 — Install MySQL

**What:** the database is a Helm chart (Bitnami), not part of our manifests. Production runs
3 nodes (1 primary + 2 replicas) — the 5/5/3 requirement of the brief.

**Run:**
```powershell
Copy-Item k8s/mysql/values.example.yaml k8s/mysql/values.yaml
#    fill in the real passwords (the app user's password must match secret.yaml)

helm install mysql oci://registry-1.docker.io/bitnamicharts/mysql -n hotel -f k8s/mysql/values.yaml
```

**Check:**
```powershell
kubectl get pods -n hotel        # mysql-primary-0, mysql-secondary-0, mysql-secondary-1 -> 1/1
```

For the dev namespace, a single node is enough:
```powershell
helm install mysql-dev oci://registry-1.docker.io/bitnamicharts/mysql -n hotel-dev `
  -f k8s/mysql/values.yaml --set architecture=standalone --set fullnameOverride=mysql-primary
```

---

## Step 7 — Install ArgoCD

**What:** ArgoCD is the agent that lives inside the cluster and keeps it in sync with git. From here
on you never run `kubectl apply` for the application again — you push to git instead.

**Run:**
```powershell
kubectl create namespace argocd
kubectl apply -n argocd --server-side --force-conflicts `
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

**Check:**
```powershell
kubectl get pods -n argocd       # all pods Running (takes a couple of minutes)
```

Admin password and UI:
```powershell
kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath="{.data.password}"   # base64
kubectl port-forward svc/argocd-server -n argocd 18080:443      # then open https://localhost:18080
```

---

## Step 8 — Tell ArgoCD what to deploy

**What:** an `Application` object says "watch this git folder, and make this namespace match it".
Four of them: production, dev, metrics, logs. Applying them is the **last manual step** — everything
after this is deployed by ArgoCD from git.

**Run:**
```powershell
kubectl apply -f k8s/argocd/application.yaml       # branch main -> namespace hotel
kubectl apply -f k8s/argocd/application-dev.yaml   # branch dev  -> namespace hotel-dev
kubectl apply -f k8s/argocd/monitoring.yaml        # Prometheus + Grafana
kubectl apply -f k8s/argocd/loki.yaml              # Loki + Promtail (logs)
```

**Check:**
```powershell
kubectl get applications -n argocd    # every app -> Synced / Healthy
kubectl get pods -n hotel             # backend x5, frontend x5, nexus, phpmyadmin, migrate Job
```

ArgoCD has now deployed the whole application, the Ingress, the migration Job and the observability
stack — none of which you applied by hand.

---

## Step 9 — Open it

**What:** the Ingress routes by hostname, so the hostnames must resolve to your machine, and the
ingress controller must be reachable (on Windows port 80 is often taken, so use a high port).

**Run:**
```powershell
# once, as administrator
Add-Content -Path "$env:windir\System32\drivers\etc\hosts" -Value "127.0.0.1 hotel.local"
Add-Content -Path "$env:windir\System32\drivers\etc\hosts" -Value "127.0.0.1 grafana.local"

# keep this terminal open
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8088:80
```

**Check:**

| What | URL |
|---|---|
| Application | http://hotel.local:8088 |
| Grafana | http://grafana.local:8088 |
| ArgoCD | https://localhost:18080 |

Grafana's admin password:
```powershell
kubectl get secret monitoring-grafana -n monitoring -o jsonpath="{.data.admin-password}"   # base64
```

**The exam scope is now running.** Steps 10–13 below only apply to branch `dev`.

---

# PART B — beyond the exam (branch `dev`)

## Step 10 — Sealed Secrets: let git hold the secrets

**What:** a controller with an RSA key pair. Secrets are encrypted with its public key and committed
to git as `SealedSecret` objects; only this cluster can decrypt them. After this step, Step 5 is no
longer needed — the secrets recreate themselves.

**Run:**
```powershell
# 1. restore the private key FIRST, before the controller generates a new one.
#    (Without the original key, everything in k8s/sealed/ becomes undecryptable.)
kubectl apply -f <your-backup>\sealed-secrets-master.key.yaml

# 2. the controller, and the Application that syncs k8s/sealed/
kubectl apply -f k8s/argocd/sealed-secrets.yaml
kubectl apply -f k8s/argocd/cluster-secrets.yaml
kubectl rollout restart deploy/sealed-secrets-controller -n kube-system
```

**Check:**
```powershell
kubectl get sealedsecret -A       # SYNCED = True for all of them
kubectl get secret -n hotel-dev   # hotel-secret and ghcr-cred exist — created by the controller
```

To seal a **new** secret later:
```powershell
kubectl get secret <name> -n <ns> -o yaml | kubeseal --format yaml > k8s/sealed/<name>.yaml
```

---

## Step 11 — Backups: check that they work

**What:** a `CronJob` dumps the database every night to its own PVC. A separate restore Job is run
by hand — deliberately, so ArgoCD can never replay it over a live database.

**Run:**
```powershell
# don't wait until 03:00 — create the job from the CronJob template right now
kubectl create job --from=cronjob/mysql-backup backup-check -n hotel-dev
kubectl logs job/backup-check -n hotel-dev
```

**Check:** the log ends with `[backup] wrote /backup/hoteldb-....sql.gz (4.0K)` and lists the dumps
on the disk.

Restoring (this **overwrites** the database):
```powershell
kubectl -n hotel-dev apply -f k8s/base/jobs/restore-job.yaml
kubectl -n hotel-dev logs job/mysql-restore          # ends with the row count
kubectl -n hotel-dev delete job mysql-restore        # a Job is immutable: delete before re-running
```

---

## Step 12 — Alerts: make one fire

**What:** Prometheus evaluates the alert rules; Alertmanager delivers them to Telegram and email.
The bot token and SMTP password come from Sealed Secrets (Step 10).

**Run:**
```powershell
kubectl -n monitoring exec alertmanager-monitoring-kube-prometheus-alertmanager-0 -c alertmanager -- `
  amtool alert add TestAlert namespace=hotel-dev severity=critical --alertmanager.url=http://localhost:9093
```

**Check:** within ~30 seconds a message arrives in Telegram and in the mailbox.

---

## Step 13 — Autoscaling: watch pods appear

**What:** the HPA reads CPU usage and changes the replica count by itself. The load generator must
run **inside** the cluster, because the backend Service is ClusterIP (not reachable from your laptop).

**Run:**
```powershell
# terminal 1 — watch
kubectl get hpa -n hotel-dev -w

# terminal 2 — 50 concurrent clients for 3 minutes
kubectl run load-gen --rm -it --restart=Never -n hotel-dev --image=williamyeh/hey `
  -- -z 3m -c 50 http://backend:8080/api/hotels
```

**Check:** in terminal 1 the replica count climbs 1 → 5 within a minute, and drops back to 1 about
five minutes after the load stops (the scale-down stabilization window).

---

## Teardown

```powershell
minikube delete        # deletes the whole cluster; git is untouched
```
