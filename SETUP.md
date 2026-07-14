# Setup — from an empty machine to a running cluster

The cluster is local (minikube) and is **not** stored in git: it is rebuilt from scratch on every
machine. Real secrets are never committed — only `*.example.yaml` templates are.

Commands are PowerShell (Windows). On Linux/macOS they are the same, only the path separators and
the file-copy command differ.

---

## 0. Prerequisites

- **Docker Desktop** (running), **kubectl**, **helm**, **minikube**, **git**
- A **GitHub PAT** with `read:packages` — the container images live in a private GHCR registry.

```powershell
docker -v ; kubectl version --client ; helm version ; minikube version
```

---

## 1. Run it locally first (no Kubernetes) — Part 1

```powershell
cp .env.example .env      # then fill in the values
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:8090 |
| phpMyAdmin | http://localhost:8081 |
| Backend API | http://localhost:5000 |

---

## 2. Cluster — Part 2

```powershell
minikube start --driver=docker --insecure-registry="192.168.49.0/24" --cpus=4 --memory=8192
minikube addons enable ingress            # ingress-nginx controller
minikube addons enable metrics-server     # required by the HPA (branch dev)

kubectl get nodes                         # minikube  Ready  control-plane
```

> `--insecure-registry` can only be set **at creation time**. It lets the cluster pull over HTTP
> from the in-cluster Nexus.

```powershell
kubectl create namespace hotel
kubectl create namespace hotel-dev        # only if you want the dev environment too
```

## 3. Secrets (never in git)

```powershell
# application secret: DB connection string, JWT signing key, bootstrap admin password
Copy-Item k8s/base/secrets/secret.example.yaml k8s/base/secrets/secret.yaml
#   -> edit secret.yaml and fill in real values (Jwt__Secret must be >= 32 chars)
kubectl apply -f k8s/base/secrets/secret.yaml

# pull credentials for the private GHCR images
kubectl create secret docker-registry ghcr-cred -n hotel `
  --docker-server=ghcr.io --docker-username=<github-user> --docker-password=<PAT>
```

Repeat both for `hotel-dev` if you use the dev environment (`-n hotel-dev`).

> On branch `dev` this step disappears: the secrets live in git as **SealedSecret** objects and the
> controller materialises them (see §7).

## 4. MySQL (Helm, Bitnami)

```powershell
Copy-Item k8s/mysql/values.example.yaml k8s/mysql/values.yaml
#   -> fill in the real passwords (root, app user = same as in secret.yaml, replication)

# prod: 3 nodes (1 primary + 2 secondaries) — the 5/5/3 requirement
helm install mysql oci://registry-1.docker.io/bitnamicharts/mysql -n hotel -f k8s/mysql/values.yaml

# dev (optional): a single standalone node, exposed under the same service name
helm install mysql-dev oci://registry-1.docker.io/bitnamicharts/mysql -n hotel-dev `
  -f k8s/mysql/values.yaml --set architecture=standalone --set fullnameOverride=mysql-primary
```

```powershell
kubectl get pods -n hotel      # mysql-primary-0, mysql-secondary-0, mysql-secondary-1 -> 1/1
```

## 5. ArgoCD — Part 4

```powershell
kubectl create namespace argocd
kubectl apply -n argocd --server-side --force-conflicts `
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# UI (admin password: the secret below); the port-forward occupies the terminal
kubectl port-forward svc/argocd-server -n argocd 18080:443
kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath="{.data.password}"   # base64
```

Then register the Applications. **From here on nothing is applied by hand** — ArgoCD reconciles the
cluster with git:

```powershell
kubectl apply -f k8s/argocd/application.yaml       # prod:  branch main -> namespace hotel
kubectl apply -f k8s/argocd/application-dev.yaml   # dev:   branch dev  -> namespace hotel-dev
kubectl apply -f k8s/argocd/monitoring.yaml        # Prometheus + Grafana (+ Alertmanager on dev)
kubectl apply -f k8s/argocd/loki.yaml              # Loki + Promtail
```

ArgoCD now deploys backend ×5, frontend ×5, Nexus, phpMyAdmin, the migration Job, the Ingress and
the whole observability stack.

```powershell
kubectl get applications -n argocd    # all should reach Synced / Healthy
kubectl get pods -n hotel
```

## 6. Access

```powershell
# hosts file (once, as administrator)
Add-Content -Path "$env:windir\System32\drivers\etc\hosts" -Value "127.0.0.1 hotel.local"
Add-Content -Path "$env:windir\System32\drivers\etc\hosts" -Value "127.0.0.1 grafana.local"

# expose the ingress controller (port 80 may be taken on Windows -> use a high port)
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8088:80
```

| What | URL |
|---|---|
| Application | http://hotel.local:8088 |
| Grafana | http://grafana.local:8088 |
| ArgoCD | https://localhost:18080 |

Grafana admin password:

```powershell
kubectl get secret monitoring-grafana -n monitoring -o jsonpath="{.data.admin-password}"   # base64
```

---

## 7. Branch `dev` only — beyond-exam extras

### Sealed Secrets (C4)

The private key lives **in the cluster**. If you rebuild the cluster, restore the key **before** the
controller generates a new one — otherwise everything in `k8s/sealed/` becomes undecryptable.

```powershell
kubectl apply -f <your-backup>\sealed-secrets-master.key.yaml    # keep this file OUT of git
kubectl apply -f k8s/argocd/sealed-secrets.yaml                  # the controller
kubectl apply -f k8s/argocd/cluster-secrets.yaml                 # the SealedSecrets from k8s/sealed/
kubectl rollout restart deploy/sealed-secrets-controller -n kube-system

kubectl get sealedsecret -A          # SYNCED=True -> the plain Secrets are created automatically
```

Sealing a new secret:

```powershell
kubectl get secret <name> -n <ns> -o yaml | kubeseal --format yaml > k8s/sealed/<name>.yaml
```

### Alerting (C2)

Alertmanager delivers to Telegram and email. Both credentials are Sealed Secrets, so they come from
git; only `chat_id` and the sender address are in `k8s/argocd/monitoring.yaml` in clear text.

```powershell
# smoke test: inject an alert by hand
kubectl -n monitoring exec alertmanager-monitoring-kube-prometheus-alertmanager-0 -c alertmanager -- `
  amtool alert add TestAlert namespace=hotel-dev severity=critical --alertmanager.url=http://localhost:9093
```

### Backups (C1)

```powershell
kubectl get cronjob,pvc -n hotel-dev

# run the backup now instead of waiting for 03:00
kubectl create job --from=cronjob/mysql-backup backup-check -n hotel-dev
kubectl logs job/backup-check -n hotel-dev            # "[backup] wrote /backup/hoteldb-....sql.gz"

# restore (manual on purpose — it must never run automatically)
kubectl -n hotel-dev apply -f k8s/base/jobs/restore-job.yaml
kubectl -n hotel-dev logs job/mysql-restore
kubectl -n hotel-dev delete job mysql-restore         # a Job is immutable: delete before re-running
```

### Autoscaling (C3)

```powershell
kubectl get hpa -n hotel-dev                          # TARGETS must show numbers, not <unknown>

# generate load from INSIDE the cluster (the backend Service is ClusterIP)
kubectl run load-gen --rm -it --restart=Never -n hotel-dev --image=williamyeh/hey `
  -- -z 3m -c 50 http://backend:8080/api/hotels

kubectl get hpa -n hotel-dev -w                       # 1 -> 5 pods, then back to 1 after the load stops
```

---

## Teardown

```powershell
minikube delete        # removes the whole cluster; git is untouched
```
