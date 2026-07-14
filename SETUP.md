# Setup — from an empty machine to a running cluster

Every step has the same shape:

> **What** — what this step does, in one line.
> **Run** — the commands.
> **Check** — how you know it worked.
> **If it fails** — the failure you are most likely to hit, and the fix.

The cluster is local (minikube) and is **not** in git — it is rebuilt from scratch on each machine.
Real secrets are never committed; only `*.example.yaml` templates are.
Commands are PowerShell (Windows); on Linux/macOS only the path separators differ.

---

## Step 0 — What you need installed

**What:** four tools. Docker runs the cluster as a container, `minikube` creates that cluster,
`kubectl` talks to it, `helm` installs third-party charts (MySQL, Prometheus). You also need a
**GitHub PAT** with the `read:packages` scope, because the container images live in a private
registry (GHCR).

**Run:**
```powershell
docker -v ; kubectl version --client ; helm version ; minikube version
```

**Check:** each command prints a version, and Docker Desktop is **running** ("Engine running").

**If it fails** — install what is missing:
```powershell
winget install -e --id Docker.DockerDesktop
winget install -e --id Kubernetes.kubectl
winget install -e --id Helm.Helm
winget install -e --id Kubernetes.minikube
```
Then **open a new terminal** — `PATH` is only picked up by newly opened shells. On macOS/Linux:
`brew install kubectl helm minikube` (plus a Docker engine).

No `winget`, no admin rights? Download the binary into a folder of your own and add it to the user
`PATH`:
```powershell
New-Item -Path 'C:\tools' -ItemType Directory -Force
Invoke-WebRequest -OutFile 'C:\tools\minikube.exe' `
  -Uri 'https://github.com/kubernetes/minikube/releases/latest/download/minikube-windows-amd64.exe'
$u = [Environment]::GetEnvironmentVariable('Path','User')
[Environment]::SetEnvironmentVariable('Path', "$u;C:\tools", 'User')   # reopen the terminal afterwards
```

---


## Step 1 — Try the app without Kubernetes (optional, 2 minutes)

**What:** Docker Compose starts the three tiers (frontend, backend, MySQL) on your laptop — the
application before any Kubernetes is involved.

**Run:**
```powershell
cp .env.example .env      # then open .env and fill in the values
docker compose up --build
```

**Check:** http://localhost:8090 shows the app, http://localhost:8081 shows phpMyAdmin.

**If it fails:**
- *"port is already allocated"* — something else uses 8090/8081/5000. Stop it, or change the port
  mapping in `docker-compose.yml`.
- *backend restarts in a loop* — it cannot reach MySQL. MySQL takes ~20 s to accept connections on
  first boot; check `docker compose logs db`, and make sure the password in `.env` is the one you
  actually set.

Stop it with `Ctrl+C` before moving on — Kubernetes will want the same ports.

---

## Step 2 — Create the cluster

**What:** minikube starts a single-node Kubernetes cluster inside a Docker container.

**Run:**
```powershell
minikube start --driver=docker --insecure-registry="192.168.49.0/24" --cpus=4 --memory=8192
```

**Check:**
```powershell
kubectl get nodes
```
```
NAME       STATUS   ROLES           AGE   VERSION
minikube   Ready    control-plane   1m    v1.35.1
```

**If it fails:**
- *"Cannot connect to the Docker daemon"* — Docker Desktop is not running. Start it, wait for
  "Engine running", retry.
- *the cluster hangs or dies on start* — give it less memory (`--memory=6144`), or reset it
  completely: `minikube delete` then `minikube start ...` again.
- *`kubectl` says `x509: certificate signed by unknown authority` or `connection refused`* — in 99 %
  of cases **the cluster is simply not running**. Check with `minikube status` before looking for
  anything more exotic.

> `--insecure-registry` can only be set **when the cluster is created**. It allows pulling images
> over plain HTTP from the Nexus registry that runs inside the cluster.

---

## Step 3 — Turn on the two addons

**What:** `ingress` installs the reverse proxy that exposes the app by hostname.
`metrics-server` collects CPU/RAM usage — the autoscaler (branch `dev`) is blind without it.

**Run:**
```powershell
minikube addons enable ingress
minikube addons enable metrics-server
```

**Check:**
```powershell
kubectl get pods -n ingress-nginx
kubectl top nodes
```
```
NAME                                       READY   STATUS      RESTARTS   AGE
ingress-nginx-admission-create-xxxxx       0/1     Completed   0          2m     <- Completed is normal
ingress-nginx-controller-xxxxxxxxxx-xxxxx  1/1     Running     0          2m     <- this must be 1/1

NAME       CPU(cores)   CPU(%)   MEMORY(bytes)   MEMORY(%)
minikube   411m         4%       8281Mi          34%
```

**If it fails:**
- *`kubectl top` says "Metrics API not available"* — metrics-server needs ~1 minute to collect its
  first samples. Wait and retry.
- *it still says that after a few minutes* — look at the pod:
  `kubectl get pods -n kube-system | Select-String metrics-server`. A `0/1` pod means its readiness
  probe fails; under heavy load the kubelet cannot answer in time and the pod reports itself as not
  ready. It recovers on its own once the node is idle.

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

**If it fails:** *"already exists"* is not an error — the namespace is there, move on.

---

## Step 5 — Create the secrets (these are NOT in git)

**What:** two secrets. `hotel-secret` holds the DB connection string, the JWT signing key and the
bootstrap admin password. `ghcr-cred` is the login the cluster uses to pull the private images.
They serve different consumers: the **app** reads the first one, the **kubelet** uses the second one
to download the image before the container even starts.

**Run:**
```powershell
# 1. application secret — copy the template and fill in real values
Copy-Item k8s/base/secrets/secret.example.yaml k8s/base/secrets/secret.yaml
#    open secret.yaml: Jwt__Secret must be at least 32 characters
kubectl apply -f k8s/base/secrets/secret.yaml

# 2. registry credentials (the PAT needs the read:packages scope)
kubectl create secret docker-registry ghcr-cred -n hotel `
  --docker-server=ghcr.io --docker-username=<github-user> --docker-password=<PAT>
```

**Check:**
```powershell
kubectl get secret -n hotel
```
```
NAME           TYPE                             DATA   AGE
ghcr-cred      kubernetes.io/dockerconfigjson   1      10s
hotel-secret   Opaque                           3      30s
```

Repeat both with `-n hotel-dev` if you want the dev environment.

**If it fails:**
- *pods later show `ImagePullBackOff`* — `ghcr-cred` is wrong or missing **in that namespace**.
  Secrets are namespaced: one in `hotel` does nothing for `hotel-dev`. Delete and recreate it.
- *pods later show `CreateContainerConfigError`* — the pod refers to a secret key that does not
  exist. Compare your `secret.yaml` with `secret.example.yaml`, key by key.

> On branch `dev` this whole step disappears: the secrets live in git as **SealedSecret** objects
> (encrypted) and are recreated automatically — see Step 10.

---

## Step 6 — Install MySQL

**What:** the database is a Helm chart (Bitnami), not one of our manifests. Production runs 3 nodes
(1 primary + 2 replicas) — the 5/5/3 requirement of the brief.

**Run:**
```powershell
Copy-Item k8s/mysql/values.example.yaml k8s/mysql/values.yaml
#    fill in the real passwords — the app user's password must match the one in secret.yaml

helm install mysql oci://registry-1.docker.io/bitnamicharts/mysql -n hotel -f k8s/mysql/values.yaml
```

For the dev namespace a single node is enough:
```powershell
helm install mysql-dev oci://registry-1.docker.io/bitnamicharts/mysql -n hotel-dev `
  -f k8s/mysql/values.yaml --set architecture=standalone --set fullnameOverride=mysql-primary
```

**Check:** (MySQL takes 1–2 minutes to come up)
```powershell
kubectl get pods -n hotel
```
```
NAME                READY   STATUS    RESTARTS   AGE
mysql-primary-0     1/1     Running   0          2m
mysql-secondary-0   1/1     Running   0          2m
mysql-secondary-1   1/1     Running   0          1m
```

**If it fails:**
- *the pods stay `Pending`* — the node is out of CPU/RAM. `kubectl describe pod <name>` says so at
  the bottom, under Events. Give minikube more memory, or install fewer replicas.
- *`ImagePullBackOff` on the MySQL pods* — the Bitnami image tag moved. The chart's values pin
  `bitnamilegacy/mysql`; do not override the tag by hand.
- *the app later cannot log in to the database* — the app user's password in `values.yaml` and in
  `secret.yaml` are different. They must be the same string.

---

## Step 7 — Install ArgoCD

**What:** ArgoCD is the agent that lives **inside** the cluster and keeps it in sync with git. After
this step you stop running `kubectl apply` for the application — you push to git instead.

**Run:**
```powershell
kubectl create namespace argocd
kubectl apply -n argocd --server-side --force-conflicts `
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

**Check:**
```powershell
kubectl get pods -n argocd       # all pods Running (a couple of minutes)
```

Admin password and UI:
```powershell
kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath="{.data.password}"   # base64
kubectl port-forward svc/argocd-server -n argocd 18080:443      # then open https://localhost:18080
```

**If it fails:**
- *"metadata.annotations: Too long"* — apply with `--server-side` (as above). The ArgoCD manifests
  are too big for the client-side apply annotation.
- *the browser refuses the certificate* — ArgoCD serves a self-signed certificate. Accept it.
- *the UI asks for a repository password* — the repo is private: add it in
  **Settings → Repositories → Connect repo**, using a PAT as the password.

---

## Step 8 — Tell ArgoCD what to deploy

**What:** an `Application` object says: "watch this git folder, and make this namespace match it".
Applying these four objects is the **last manual step** — everything after it is deployed from git.

**Run:**
```powershell
kubectl apply -f k8s/argocd/application.yaml       # branch main -> namespace hotel
kubectl apply -f k8s/argocd/application-dev.yaml   # branch dev  -> namespace hotel-dev
kubectl apply -f k8s/argocd/monitoring.yaml        # Prometheus + Grafana  (Bonus 1 of the brief)
kubectl apply -f k8s/argocd/loki.yaml              # Loki + Promtail (logs)
```

**Check:** (give ArgoCD a couple of minutes — it pulls the charts and applies everything)
```powershell
kubectl get applications -n argocd
kubectl get pods -n hotel
```
```
NAME         SYNC STATUS   HEALTH STATUS
hotel        Synced        Healthy
hotel-dev    Synced        Healthy
loki         Synced        Healthy
monitoring   Synced        Healthy

NAME                          READY   STATUS      RESTARTS   AGE
backend-xxxxxxxxx-xxxxx       1/1     Running     0          3m     <- five of these
frontend-xxxxxxxxx-xxxxx      1/1     Running     0          3m     <- five of these
migrate-xxxxx                 0/1     Completed   0          3m     <- Completed is correct: it ran once
mysql-primary-0               1/1     Running     0          8m
mysql-secondary-0             1/1     Running     0          8m
mysql-secondary-1             1/1     Running     0          8m
nexus-xxxxxxxxx-xxxxx         1/1     Running     0          3m
phpmyadmin-xxxxxxxxx-xxxxx    1/1     Running     0          3m
```
That is the **5 / 5 / 3** of the brief: 5 backend, 5 frontend, 3 MySQL.

**If it fails:**
- *nothing appears in the namespace* — ArgoCD polls git every ~3 minutes. Make it look now:
  ```powershell
  kubectl annotate application <name> -n argocd argocd.argoproj.io/refresh=normal --overwrite
  ```
- *`Unknown` / `ComparisonError`* — read the reason, it is precise:
  ```powershell
  kubectl get application <name> -n argocd -o jsonpath="{.status.conditions}"
  ```
  A 404 on a Helm repo means the chart URL is wrong; a git error means the repo is private and not
  yet connected in the ArgoCD UI.
- *`Synced / Healthy` but the change is not there* — `Synced` only means "the cluster matches the
  revision ArgoCD last fetched". Compare what it sees with what git has:
  ```powershell
  kubectl get application <name> -n argocd -o jsonpath="{.status.sync.revision}"
  git rev-parse origin/main
  ```
- *you edited `k8s/argocd/*.yaml` and pushed, but nothing changed* — those Application objects are
  **not** managed by ArgoCD itself. Re-apply them by hand (`kubectl apply -f ...`). The proof that a
  change landed is that the affected pod was **recreated** (its age resets).

---

## Step 9 — Open it

**What:** the Ingress routes by hostname, so the hostnames must resolve to your machine, and the
ingress controller must be reachable (on Windows port 80 is often taken — use a high port).

**Run:**
```powershell
# once, as administrator
Add-Content -Path "$env:windir\System32\drivers\etc\hosts" -Value "127.0.0.1 hotel.local"
Add-Content -Path "$env:windir\System32\drivers\etc\hosts" -Value "127.0.0.1 grafana.local"

# keep this terminal open
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8088:80
```

**Check:**

| What | URL | What you should see |
|---|---|---|
| Application | http://hotel.local:8088 | the hotel booking UI — register, log in, book a room |
| Grafana | http://grafana.local:8088 | dashboards with backend request rate/latency and cluster metrics |
| ArgoCD | https://localhost:18080 | four Applications, all green (Synced / Healthy) |
| phpMyAdmin | `minikube service phpmyadmin -n hotel` | the `hoteldb` database with the seeded tables |

Grafana's admin password:
```powershell
kubectl get secret monitoring-grafana -n monitoring -o jsonpath="{.data.admin-password}"   # base64
```

**If it fails:**
- *the browser cannot resolve the host* — the `hosts` file was not written (it needs an
  administrator terminal). Verify with `Get-Content "$env:windir\System32\drivers\etc\hosts"`.
- *404 from nginx* — you reached the ingress controller but no rule matched: the `Host` header must
  be exactly `hotel.local`. `http://localhost:8088` will always give 404.
- *the port-forward dies* — it is not a service, it is a process. It ends when the terminal closes;
  restart it.

**Everything is now running.**

> **Bonus 2** (backups, alerting, autoscaling, Sealed Secrets) is NOT part of the brief and lives on the
> `dev` branch — its own SETUP.md carries those steps:
> https://github.com/Igor-Vakul/hotel-reservation-devops/blob/dev/SETUP.md

---


## Teardown

```powershell
minikube delete        # deletes the whole cluster; git is untouched
```
