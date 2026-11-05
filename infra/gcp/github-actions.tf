# Opt-in trust for this repository's main-branch CI, without long-lived keys.
resource "google_service_account" "image_publisher" {
  count        = var.github_actions == null ? 0 : 1
  account_id   = "${var.name_prefix}-ci"
  display_name = "GitHub main CI: Artifact Registry image publisher"
  depends_on   = [google_project_service.required]
}

resource "google_iam_workload_identity_pool" "github" {
  count                     = var.github_actions == null ? 0 : 1
  workload_identity_pool_id = "${var.name_prefix}-github"
  display_name              = "Fantasy Builder GitHub CI"
  depends_on                = [google_project_service.required]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  count                              = var.github_actions == null ? 0 : 1
  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "main-ci"
  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository_id" = "assertion.repository_id"
    "attribute.repository"    = "assertion.repository"
    "attribute.ref"           = "assertion.ref"
    "attribute.event_name"    = "assertion.event_name"
    "attribute.workflow_ref"  = "assertion.workflow_ref"
  }
  attribute_condition = join(" && ", [
    "assertion.repository_id == '${var.github_actions.repository_id}'",
    "assertion.repository == '${var.github_actions.repository}'",
    "assertion.ref == 'refs/heads/main'",
    "assertion.event_name == 'push'",
    "assertion.workflow_ref == '${var.github_actions.repository}/.github/workflows/ci.yml@refs/heads/main'",
  ])
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}

resource "google_service_account_iam_member" "github_publisher" {
  count              = var.github_actions == null ? 0 : 1
  service_account_id = google_service_account.image_publisher[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.repository_id/${var.github_actions.repository_id}"
}

resource "google_artifact_registry_repository_iam_member" "image_writer" {
  count      = var.github_actions == null ? 0 : 1
  location   = var.region
  repository = google_artifact_registry_repository.app.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.image_publisher[0].email}"
}

# Deployment can access the runtime secret and administer this VM, but cannot
# publish images, change infrastructure, or access other secret containers via IAM.
resource "google_service_account" "deployer" {
  count        = var.github_actions == null ? 0 : 1
  account_id   = "${var.name_prefix}-deploy"
  display_name = "GitHub main CI: development deployment"
  depends_on   = [google_project_service.required]
}

resource "google_service_account_iam_member" "github_deployer" {
  count              = var.github_actions == null ? 0 : 1
  service_account_id = google_service_account.deployer[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.repository_id/${var.github_actions.repository_id}"
}

resource "google_secret_manager_secret_iam_member" "deployer_runtime" {
  for_each  = var.github_actions == null ? toset([]) : toset(["roles/secretmanager.secretAccessor", "roles/secretmanager.secretVersionAdder"])
  secret_id = google_secret_manager_secret.environment["runtime"].id
  role      = each.value
  member    = "serviceAccount:${google_service_account.deployer[0].email}"
}

resource "google_compute_instance_iam_member" "deployer_login" {
  count         = var.github_actions == null ? 0 : 1
  project       = var.project_id
  zone          = var.zone
  instance_name = google_compute_instance.app.name
  role          = "roles/compute.osAdminLogin"
  member        = "serviceAccount:${google_service_account.deployer[0].email}"
}

resource "google_project_iam_member" "deployer_viewer" {
  count   = var.github_actions == null ? 0 : 1
  project = var.project_id
  role    = "roles/compute.viewer"
  member  = "serviceAccount:${google_service_account.deployer[0].email}"
}

resource "google_service_account_iam_member" "deployer_vm_account" {
  count              = var.github_actions == null ? 0 : 1
  service_account_id = google_service_account.vm.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer[0].email}"
}

resource "google_iap_tunnel_instance_iam_member" "deployer" {
  count    = var.github_actions == null ? 0 : 1
  project  = var.project_id
  zone     = var.zone
  instance = google_compute_instance.app.name
  role     = "roles/iap.tunnelResourceAccessor"
  member   = "serviceAccount:${google_service_account.deployer[0].email}"
  condition {
    title      = "ssh-only"
    expression = "destination.port == 22"
  }
}
