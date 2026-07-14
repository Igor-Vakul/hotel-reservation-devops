| ArgoCD | https://localhost:18080 | three Applications, all green (Synced / Healthy) |# Setup — from an empty machine to a running cluster

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
minikube start --driver=docker --insecure-registry="192.168.49.0/24" --cpus=4 --memory=16384
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
- *the cluster hangs or dies on start* — your host does not have that much RAM to spare. Lower it
  (`--memory=12288` is the practical floor with monitoring running), or reset the cluster
  completely: `minikube delete` then `minikube start ...` again.
- *`kubectl` says `x509: certificate signed by unknown authority` or `connection refused`* — in 99 %
  of cases **the cluster is simply not running**. Check with `minikube status` before looking for
  anything more exotic.

> **Sizing:** 16 GB is what this stack actually needs — the app (5+5+3 pods) plus ArgoCD, Prometheus,
> Grafana and Loki all live on this single node. 8 GB is enough for the application alone, but pods
> start landing in `Pending` once the monitoring stack is added.
>
> `--insecure-registry` can only be set **when the cluster is created**. It allows pulling images
> over plain HTTP from the Nexus registry that runs inside the cluster.

---

## Step 3 — Turn on the ingress addon

**What:** `ingress` installs the reverse proxy that exposes the app by hostname.

**Run:**
```powershell
minikube addons enable ingress
```

**Check:**
```powershell
kubectl get pods -n ingress-nginx
```
```
NAME                                       READY   STATUS      RESTARTS   AGE
ingress-nginx-admission-create-xxxxx       0/1     Completed   0          2m     <- Completed is normal
ingress-nginx-controller-xxxxxxxxxx-xxxxx  1/1     Running     0          2m     <- this must be 1/1
```

**If it fails:**
- *the controller pod stays `ContainerCreating` for minutes* — it is pulling its image; that is normal
  on a cold cluster.
- *`admission-create` shows `Completed`* — that is not an error: it is a one-off Job that generated
  the webhook certificate and exited.

---

## Step 4 — Create the namespace

**What:** a namespace is a folder inside the cluster. Everything in this guide goes into `hotel`.

**Run:**
```powershell
kubectl create namespace hotel
```

**Check:** `kubectl get ns` lists `hotel`.

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

**If it fails:**
- *pods later show `ImagePullBackOff`* — `ghcr-cred` is wrong or missing **in that namespace**.
  Secrets are namespaced: one created in another namespace does nothing here. Delete and recreate it
  with `-n hotel`.
- *pods later show `CreateContainerConfigError`* — the pod refers to a secret key that does not
  exist. Compare your `secret.yaml` with `secret.example.yaml`, key by key.

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
Applying these three objects is the **last manual step** — everything after it is deployed from git.
(`k8s/argocd/application-dev.yaml` also exists; it deploys the second environment from the `dev`
branch and is described in that branch's SETUP.md.)

**Run:**
```powershell
kubectl apply -f k8s/argocd/application.yaml   # branch main -> namespace hotel (the app itself)
kubectl apply -f k8s/argocd/monitoring.yaml    # Prometheus + Grafana   (Bonus 1 of the brief)
kubectl apply -f k8s/argocd/loki.yaml         # Loki + Promtail (logs) (Bonus 1 of the brief)
```

**Check:** (give ArgoCD a couple of minutes — it pulls the charts and applies everything)
```powershell
kubectl get applications -n argocd
kubectl get pods -n hotel
```
```
NAME         SYNC STATUS   HEALTH STATUS
hotel        Synced        Healthy
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
| ArgoCD | https://localhost:18080 | three Applications, all green (Synced / Healthy) |
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

**The exam scope (Parts 1-4 + Bonus 1) is now running in namespace `hotel`.**

Everything below is **Bonus 2** — not required by the brief. It lives in a second environment
(namespace `hotel-dev`), so it cannot break the one you just built.

> Note: on this branch `monitoring.yaml` (Step 8) also enables **Alertmanager**, and Alertmanager
> mounts the Telegram/SMTP secrets. Until Step 11 creates them, its pod stays `ContainerCreating` —
> that is expected, not a failure.



---

# PART B — Bonus 2 (this branch only, namespace `hotel-dev`)

## Step 10 — Create the dev environment (namespace + its own MySQL)

**What:** a second, slim environment: one backend, one frontend, a single MySQL node. Enough to
exercise backups, alerts and autoscaling without touching production.

**Run:**
```powershell
kubectl create namespace hotel-dev

helm install mysql-dev oci://registry-1.docker.io/bitnamicharts/mysql -n hotel-dev `
  -f k8s/mysql/values.yaml --set architecture=standalone --set fullnameOverride=mysql-primary
```

**Check:**
```powershell
kubectl get pods -n hotel-dev
```
```
NAME              READY   STATUS    RESTARTS   AGE
mysql-primary-0   1/1     Running   0          2m
```

**If it fails:**
- `fullnameOverride` is not cosmetic: the Service must be called `mysql-primary` in **both**
  environments, because the connection string inside the Secret points at that name.
- The chart names its own Secret after the **release**: `mysql` in production, `mysql-primary` in
  dev. The backup CronJob reads the DB password from it — that is why the dev overlay patches the
  secret name.

---

## Step 11 — Sealed Secrets: the secrets come from git

**What:** a controller holding an RSA key pair. A Secret is encrypted with its **public** key and
committed as a `SealedSecret` (`k8s/sealed/`); only this cluster holds the private key, so the
ciphertext is safe even in a public repo. This replaces Step 5 for `hotel-dev` — the secrets create
themselves.

**Run:**
```powershell
# 1. restore the private key FIRST — before the controller generates a new one
kubectl apply -f <your-backup>\sealed-secrets-master.key.yaml

# 2. the controller, and the Application that syncs k8s/sealed/
kubectl apply -f k8s/argocd/sealed-secrets.yaml
kubectl apply -f k8s/argocd/cluster-secrets.yaml
kubectl rollout restart deploy/sealed-secrets-controller -n kube-system
```

**Check:**
```powershell
kubectl get sealedsecret -A
kubectl get secret -n hotel-dev
```
```
NAMESPACE    NAME           STATUS   SYNCED   AGE
hotel-dev    ghcr-cred               True     1m      <- SYNCED=True means it decrypted
hotel-dev    hotel-secret            True     1m
monitoring   smtp                    True     1m
monitoring   telegram-bot            True     1m

NAME           TYPE                             DATA   AGE
ghcr-cred      kubernetes.io/dockerconfigjson   1      50s  <- created by the controller,
hotel-secret   Opaque                           3      50s     not by you
```

Alertmanager can now mount its secrets and starts.

**If it fails:**
- *`no key could decrypt secret`* — this cluster's private key is not the one the files were sealed
  with. Restore the original key, or re-seal from the original values (below).
- *`failed update: Resource "x" already exists and is not managed by SealedSecret`* — a Secret of that
  name was created by hand, and the controller refuses to overwrite what it does not own. (That is a
  safety feature: otherwise anyone able to commit could overwrite any Secret in the cluster.) Delete
  the hand-made Secret, then `kubectl rollout restart deploy/sealed-secrets-controller -n kube-system`.
- *nothing happens after deleting that Secret* — the controller reacts to changes of the SealedSecret
  **spec**, and does not watch Secrets it does not own. The restart above forces a full re-reconcile.

Sealing a **new** secret (needs the `kubeseal` CLI):
```powershell
Invoke-WebRequest -Uri "https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.38.4/kubeseal-0.38.4-windows-amd64.tar.gz" -OutFile "$env:TEMP\kubeseal.tar.gz"
tar -xzf "$env:TEMP\kubeseal.tar.gz" -C C:\tools kubeseal.exe

kubectl get secret <name> -n <ns> -o yaml | kubeseal --format yaml > k8s/sealed/<name>.yaml
```

---

## Step 12 — Deploy the dev environment

**What:** one more `Application`. ArgoCD now deploys the app into `hotel-dev` **and** everything
Bonus 2 adds: the backup CronJob with its PVC, the alert rules, and the HPA.

**Run:**
```powershell
kubectl apply -f k8s/argocd/application-dev.yaml
```

**Check:**
```powershell
kubectl get application -n argocd
kubectl get pods,cronjob,pvc,hpa -n hotel-dev
```
```
NAME              SYNC STATUS   HEALTH STATUS
cluster-secrets   Synced        Healthy
hotel             Synced        Healthy
hotel-dev         Synced        Healthy
loki              Synced        Healthy
monitoring        Synced        Healthy
sealed-secrets    Synced        Healthy

NAME                         READY   STATUS      RESTARTS   AGE
pod/backend-xxxxxxxx-xxxxx   1/1     Running     0          2m
pod/frontend-xxxxxxx-xxxxx   1/1     Running     0          2m
pod/migrate-xxxxx            0/1     Completed   0          2m
pod/mysql-primary-0          1/1     Running     0          8m

NAME                         SCHEDULE    TIMEZONE         SUSPEND   ACTIVE   LAST SCHEDULE
cronjob.batch/mysql-backup   0 3 * * *   Asia/Jerusalem   False     0        <none>

NAME                                 STATUS   CAPACITY   ACCESS MODES
persistentvolumeclaim/mysql-backup   Bound    1Gi        RWO

NAME                                          REFERENCE            TARGETS       MINPODS   MAXPODS
horizontalpodautoscaler.autoscaling/backend   Deployment/backend   cpu: 1%/50%   1         5
```

**If it fails:**
- *pods show `CreateContainerConfigError`* — the secrets are missing: Step 11 has not finished.
- *`TARGETS` shows `<unknown>`* — metrics-server is not enabled yet (next step).

---

## Step 13 — Autoscaling: watch pods appear

**What:** the HPA reads CPU usage from metrics-server and changes the replica count by itself. Usage
is a percentage **of `resources.requests.cpu`** — without a request the HPA is blind.

**Run:**
```powershell
minikube addons enable metrics-server      # the HPA cannot work without it
kubectl top nodes                          # numbers show up after ~1 minute

# terminal 1 — watch
kubectl get hpa -n hotel-dev -w

# terminal 2 — 50 concurrent clients for 3 minutes, from INSIDE the cluster
# (the backend Service is ClusterIP: not reachable from your laptop)
kubectl run load-gen --rm -it --restart=Never -n hotel-dev --image=williamyeh/hey `
  -- -z 3m -c 50 http://backend:8080/api/hotels
```

**Check:** terminal 1 shows the replica count climb, then fall back about five minutes after the load
stops (the scale-down stabilization window):
```
NAME      REFERENCE            TARGETS         MINPODS   MAXPODS   REPLICAS
backend   Deployment/backend   cpu: 1%/50%     1         5         1
backend   Deployment/backend   cpu: 180%/50%   1         5         1    <- load arrives
backend   Deployment/backend   cpu: 180%/50%   1         5         5    <- scaled up
backend   Deployment/backend   cpu: 2%/50%     1         5         5    <- load stopped
backend   Deployment/backend   cpu: 2%/50%     1         5         1    <- ~5 minutes later
```

**If it fails:**
- *pods scale up and are killed immediately* — ArgoCD's `selfHeal` is resetting `spec.replicas` to the
  value in git. `application-dev.yaml` prevents that with `ignoreDifferences` on `/spec/replicas` plus
  `RespectIgnoreDifferences=true`; make sure that file was applied.
- *`TARGETS` turns into `<unknown>` during the test* — on a single node the app, the control plane and
  the monitoring stack share one CPU, and the kubelet can fail to answer metrics-server in time. The
  HPA then **freezes** at the current replica count (it never scales blindly) and recovers when the
  load ends.

---

## Step 14 — Backups, and the restore drill

**What:** a `CronJob` dumps the database every night onto its own PVC. The restore Job is run **by
hand** on purpose: inside the GitOps sync loop, ArgoCD would replay it over a live database on every
sync.

**Run:**
```powershell
# do not wait until 03:00 — create a Job from the CronJob template right now
kubectl create job --from=cronjob/mysql-backup backup-check -n hotel-dev
kubectl logs job/backup-check -n hotel-dev
```

**Check:**
```
[backup] wrote /backup/hoteldb-2026-07-14_0625.sql.gz (4.0K)
[backup] pruning dumps older than 7 days
total 8.0K
-rw-r--r-- 1 1001 root 1.7K Jul 14 00:00 hoteldb-2026-07-14_0000.sql.gz
-rw-r--r-- 1 1001 root 1.7K Jul 14 06:25 hoteldb-2026-07-14_0625.sql.gz
```
A few KB is a real dump. **~20 bytes is an empty gzip header** — a failed dump, not a backup.

**The drill** — destroy the database and bring it back:
```powershell
# 1. what is in there now
kubectl exec -n hotel-dev mysql-primary-0 -- bash -c 'mysql -u root -p"$(cat $MYSQL_ROOT_PASSWORD_FILE)" -e "SELECT * FROM hoteldb.Hotels;"'

# 2. destroy it
kubectl exec -n hotel-dev mysql-primary-0 -- bash -c 'mysql -u root -p"$(cat $MYSQL_ROOT_PASSWORD_FILE)" -e "DROP DATABASE hoteldb;"'

# 3. restore from the newest dump
kubectl -n hotel-dev apply -f k8s/base/jobs/restore-job.yaml
kubectl -n hotel-dev logs job/mysql-restore       # prints the row count at the end
kubectl -n hotel-dev delete job mysql-restore     # a Job is immutable: delete before re-running

# 4. the rows are back
kubectl exec -n hotel-dev mysql-primary-0 -- bash -c 'mysql -u root -p"$(cat $MYSQL_ROOT_PASSWORD_FILE)" -e "SELECT * FROM hoteldb.Hotels;"'
```

**If it fails:**
- *`Can't connect to MySQL server ... (111)`* — MySQL is not running: `kubectl get pods -n hotel-dev`.
- *`Access denied ... PROCESS privilege`* — `mysqldump` is asking for tablespace metadata with a
  least-privileged user. The manifest passes `--no-tablespaces`; do not remove it.
- *never trust a green Job* — look inside the dump:
  ```powershell
  minikube ssh -- "sudo zcat /tmp/hostpath-provisioner/hotel-dev/mysql-backup/<file>.sql.gz | head -40"
  ```

---

## Step 15 — Alerts: make one fire

**What:** Prometheus evaluates the rules (`k8s/overlays/dev/backup-alerts.yaml`), Alertmanager
delivers them to Telegram and email. Two rules: *the backup Job failed* (cause) and *no successful
backup in 25 h* (symptom — that one also catches a CronJob that never ran at all).

**Run (smoke test — inject an alert by hand):**
```powershell
kubectl -n monitoring exec alertmanager-monitoring-kube-prometheus-alertmanager-0 -c alertmanager -- `
  amtool alert add TestAlert namespace=hotel-dev severity=critical --alertmanager.url=http://localhost:9093
```

**Check:** within ~30 seconds (`group_wait`) a message arrives in Telegram and in the mailbox. The
alert is also listed in the UI:
```powershell
kubectl -n monitoring port-forward svc/monitoring-kube-prometheus-alertmanager 9093:9093
# then open http://localhost:9093
```

**The real drill** — break the backup and let the alert fire by itself:
```powershell
kubectl scale statefulset mysql-primary --replicas=0 -n hotel-dev     # kill the database
kubectl create job --from=cronjob/mysql-backup mysql-backup-drill -n hotel-dev
# the Job fails -> 5 minutes later (`for: 5m`) the alert fires -> Telegram + email

kubectl scale statefulset mysql-primary --replicas=1 -n hotel-dev     # fix it
kubectl delete job mysql-backup-drill -n hotel-dev                    # -> "Resolved" message
```

**If it fails:**
- *nothing arrives anywhere* — the log names the reason:
  `kubectl -n monitoring logs alertmanager-monitoring-kube-prometheus-alertmanager-0 -c alertmanager --tail=30`
- *Telegram is silent* — you never messaged the bot first. A bot cannot open a conversation.
- *email is silent* — Gmail needs an **app password** (with 2FA enabled), not the account password.
  Check the spam folder for the first message.
- *the drill alert never fires* — the rules match Jobs **by name** (`mysql-backup.*`). A test Job named
  anything else will not trigger them.

---

## Teardown

```powershell
minikube delete        # deletes the whole cluster; git is untouched
```
