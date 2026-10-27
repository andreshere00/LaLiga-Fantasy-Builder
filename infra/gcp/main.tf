locals {
  labels = { application = var.name_prefix, managed_by = "terraform" }
  services = toset(concat([
    "compute.googleapis.com", "iam.googleapis.com", "iap.googleapis.com",
    "oslogin.googleapis.com", "storage.googleapis.com",
    "artifactregistry.googleapis.com", "secretmanager.googleapis.com",
    "cloudresourcemanager.googleapis.com",
  ], var.github_actions == null ? [] : ["iamcredentials.googleapis.com", "sts.googleapis.com"], var.billing_account_id == null ? [] : ["billingbudgets.googleapis.com"]))
  secret_ids = { for name in ["runtime", "identity", "auth", "api", "scraping"] : name => "${var.name_prefix}-${name}-env" }
  operator_roles = {
    for pair in setproduct(var.admin_members, ["roles/compute.osAdminLogin", "roles/compute.viewer"]) :
    "${pair[0]}:${pair[1]}" => { member = pair[0], role = pair[1] }
  }
  host_config = <<-ENV
    PROJECT_ID=${var.project_id}
    REGION=${var.region}
    APP_DOMAIN=${var.domain}
    BACKUP_BUCKET=${google_storage_bucket.backups.name}
    SECRET_PREFIX=${var.name_prefix}
  ENV
  # Only public configuration and script contents enter VM metadata/state.
  assets = merge({
    "/etc/fantasybuilder/host.env"                             = { mode = "0600", content = local.host_config }
    "/opt/fantasybuilder/compose.yml"                          = { mode = "0644", content = file("${path.module}/templates/compose.yml") }
    "/opt/fantasybuilder/Caddyfile"                            = { mode = "0644", content = file("${path.module}/../../docker/Caddyfile") }
    "/opt/fantasybuilder/identity.sh"                          = { mode = "0644", content = file("${path.module}/../../docker/postgres/identity.sh") }
    "/etc/systemd/system/docker.service.d/fantasybuilder.conf" = { mode = "0644", content = file("${path.module}/templates/docker-metadata-guard.conf") }
    }, {
    for name in ["fetch-secrets", "release", "start", "backup", "deploy", "metadata-guard"] :
    "/usr/local/sbin/fantasybuilder-${name}" => { mode = "0700", content = file("${path.module}/templates/${name}.sh") }
    }, {
    for name in ["fantasybuilder.service", "fantasybuilder-backup.service", "fantasybuilder-backup.timer"] :
    "/etc/systemd/system/${name}" => { mode = "0644", content = file("${path.module}/templates/${name}") }
  })
}

resource "google_project_service" "required" {
  for_each           = local.services
  service            = each.key
  disable_on_destroy = false
}

resource "google_compute_network" "app" {
  name                    = "${var.name_prefix}-network"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.required]
}

resource "google_compute_subnetwork" "app" {
  name                     = "${var.name_prefix}-subnet"
  network                  = google_compute_network.app.id
  region                   = var.region
  ip_cidr_range            = "10.42.0.0/24"
  private_ip_google_access = true
}

resource "google_compute_address" "app" {
  name         = "${var.name_prefix}-ipv4"
  region       = var.region
  address_type = "EXTERNAL"
  network_tier = "STANDARD"
  depends_on   = [google_project_service.required]
}

resource "google_compute_firewall" "https" {
  name          = "${var.name_prefix}-web"
  network       = google_compute_network.app.name
  direction     = "INGRESS"
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["${var.name_prefix}-web"]
  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
}

resource "google_compute_firewall" "iap_ssh" {
  name          = "${var.name_prefix}-iap-ssh"
  network       = google_compute_network.app.name
  direction     = "INGRESS"
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["${var.name_prefix}-web"]
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_service_account" "vm" {
  account_id   = "${var.name_prefix}-vm"
  display_name = "Fantasy Builder VM: secrets, image pulls, backup uploads"
  depends_on   = [google_project_service.required]
}

resource "google_storage_bucket" "backups" {
  name                        = "${var.project_id}-${var.name_prefix}-backups"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels
  # Bound the additional recovery window as well as live-object retention.
  soft_delete_policy { retention_duration_seconds = 604800 }
  lifecycle_rule {
    condition { age = var.backup_retention_days }
    action { type = "Delete" }
  }
  depends_on = [google_project_service.required]
}

resource "google_storage_bucket_iam_member" "backup_writer" {
  bucket = google_storage_bucket.backups.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.vm.email}"
}

resource "google_artifact_registry_repository" "app" {
  location               = var.region
  repository_id          = var.name_prefix
  format                 = "DOCKER"
  description            = "Application images; retain active tagged releases and clean old untagged layers"
  labels                 = local.labels
  cleanup_policy_dry_run = false
  cleanup_policies {
    id     = "delete-old-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s"
    }
  }
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions { keep_count = 3 }
  }
  depends_on = [google_project_service.required]
}

resource "google_artifact_registry_repository_iam_member" "image_reader" {
  location   = var.region
  repository = google_artifact_registry_repository.app.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.vm.email}"
}

resource "google_secret_manager_secret" "environment" {
  for_each            = local.secret_ids
  secret_id           = each.value
  labels              = local.labels
  deletion_protection = true
  replication {
    user_managed {
      replicas { location = var.region }
    }
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_iam_member" "vm_reader" {
  for_each  = google_secret_manager_secret.environment
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.vm.email}"
}

resource "google_compute_disk" "boot" {
  name   = "${var.name_prefix}-boot"
  zone   = var.zone
  type   = var.boot_disk_type
  size   = var.boot_disk_size_gb
  image  = "projects/debian-cloud/global/images/family/debian-12"
  labels = local.labels
  lifecycle {
    prevent_destroy = true
    # The image initializes an empty disk only; advancing the image family must
    # not replace a populated PostgreSQL disk. Patch the installed OS in place.
    ignore_changes = [image]
  }
  depends_on = [google_project_service.required]
}

resource "google_compute_instance" "app" {
  name                      = var.name_prefix
  zone                      = var.zone
  machine_type              = var.machine_type
  allow_stopping_for_update = true
  deletion_protection       = var.deletion_protection
  labels                    = local.labels
  tags                      = ["${var.name_prefix}-web"]
  boot_disk {
    source      = google_compute_disk.boot.id
    auto_delete = false
  }
  network_interface {
    subnetwork = google_compute_subnetwork.app.id
    access_config {
      nat_ip       = google_compute_address.app.address
      network_tier = "STANDARD"
    }
  }
  service_account {
    email  = google_service_account.vm.email
    scopes = ["cloud-platform"]
  }
  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }
  metadata = {
    enable-oslogin         = "TRUE"
    block-project-ssh-keys = "TRUE"
    # Metadata updates do not force replacement of the stateful host.
    startup-script = templatefile("${path.module}/templates/startup.sh.tftpl", { assets = local.assets })
  }
  depends_on = [
    google_secret_manager_secret_iam_member.vm_reader,
    google_artifact_registry_repository_iam_member.image_reader,
    google_storage_bucket_iam_member.backup_writer,
  ]
}

resource "google_project_iam_member" "operator" {
  for_each   = local.operator_roles
  project    = var.project_id
  member     = each.value.member
  role       = each.value.role
  depends_on = [google_project_service.required]
}

resource "google_service_account_iam_member" "operator" {
  for_each           = var.admin_members
  service_account_id = google_service_account.vm.name
  role               = "roles/iam.serviceAccountUser"
  member             = each.value
}

resource "google_iap_tunnel_instance_iam_member" "operator" {
  for_each = var.admin_members
  project  = var.project_id
  zone     = var.zone
  instance = google_compute_instance.app.name
  role     = "roles/iap.tunnelResourceAccessor"
  member   = each.value
}

data "google_project" "budget" {
  count      = var.billing_account_id == null ? 0 : 1
  project_id = var.project_id
  depends_on = [google_project_service.required]
}

resource "google_billing_budget" "app" {
  count           = var.billing_account_id == null ? 0 : 1
  billing_account = var.billing_account_id
  display_name    = "${var.name_prefix} monthly usage before credits"
  budget_filter {
    projects               = ["projects/${data.google_project.budget[0].number}"]
    credit_types_treatment = "EXCLUDE_ALL_CREDITS"
  }
  amount {
    specified_amount {
      currency_code = var.budget_currency
      units         = tostring(var.monthly_budget)
    }
  }
  dynamic "threshold_rules" {
    for_each = [0.5, 0.9, 1.0]
    content { threshold_percent = threshold_rules.value }
  }
}
