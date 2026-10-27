output "application_url" {
  description = "Available after image upload, secret configuration, DNS, and application activation."
  value       = "https://${var.domain}"
}

output "dns_a_record" {
  description = "Create this record at the existing DNS provider in DNS-only mode."
  value       = { name = var.domain, type = "A", value = google_compute_address.app.address }
}

output "ssh_command" {
  description = "OS Login administrator SSH through IAP."
  value       = "gcloud compute ssh ${google_compute_instance.app.name} --project=${var.project_id} --zone=${var.zone} --tunnel-through-iap"
}

output "registry" {
  description = "Push Linux amd64 application images here; grant the CI identity repository writer access separately."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}"
}

output "secret_names" {
  description = "Upload dotenv payloads with gcloud secrets versions add --data-file; Terraform creates no secret versions."
  value       = local.secret_ids
}

output "backup_bucket" {
  value = "gs://${google_storage_bucket.backups.name}"
}

output "vm_service_account" {
  value = google_service_account.vm.email
}
