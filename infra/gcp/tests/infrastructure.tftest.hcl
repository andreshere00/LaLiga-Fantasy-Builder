mock_provider "google" {
  mock_data "google_project" {
    defaults = { number = "123456789012" }
  }
}

variables {
  project_id = "fantasybuilder-test"
}

run "private_backends_and_protected_storage" {
  command = plan

  assert {
    condition     = google_compute_instance.app.machine_type == "e2-small" && google_compute_disk.boot.type == "pd-standard" && google_compute_disk.boot.size == 30
    error_message = "The initial footprint must remain the small VM with 30 GiB standard disk."
  }
  assert {
    condition     = google_compute_instance.app.boot_disk[0].auto_delete == false && google_compute_instance.app.deletion_protection
    error_message = "VM deletion must not silently delete the PostgreSQL disk."
  }
  assert {
    condition     = google_compute_address.app.network_tier == "STANDARD" && google_compute_instance.app.network_interface[0].access_config[0].network_tier == "STANDARD"
    error_message = "Both the reserved IP and NIC must use the costed Standard Network Tier."
  }
  assert {
    condition     = length(google_compute_firewall.https.allow) == 1 && one(google_compute_firewall.https.allow).protocol == "tcp" && toset(one(google_compute_firewall.https.allow).ports) == toset(["80", "443"]) && toset(google_compute_firewall.iap_ssh.source_ranges) == toset(["35.235.240.0/20"])
    error_message = "Public ingress must stay limited to HTTP/HTTPS, with SSH only from IAP."
  }
  assert {
    condition     = google_compute_instance.app.metadata["enable-oslogin"] == "TRUE" && google_compute_instance.app.metadata["block-project-ssh-keys"] == "TRUE"
    error_message = "OS Login must own administrator access."
  }
  assert {
    condition     = google_storage_bucket.backups.public_access_prevention == "enforced" && google_storage_bucket.backups.uniform_bucket_level_access && !google_storage_bucket.backups.force_destroy && google_storage_bucket_iam_member.backup_writer.role == "roles/storage.objectCreator"
    error_message = "Backups must stay private, retained on destroy, and upload-only from the VM."
  }
  assert {
    condition     = length(google_secret_manager_secret.environment) == 5 && alltrue([for secret in google_secret_manager_secret.environment : secret.deletion_protection])
    error_message = "Keep the five service-separated secret containers protected."
  }
  assert {
    condition     = length(google_billing_budget.app) == 0 && length(google_project_iam_member.operator) == 0 && length(google_service_account.image_publisher) == 0 && length(google_iam_workload_identity_pool.github) == 0
    error_message = "Optional budget and administrator IAM must not create unsolicited grants."
  }
  assert {
    condition     = length(google_compute_instance.app.metadata["startup-script"]) < 262144
    error_message = "The encoded bootstrap must fit the metadata script limit."
  }
}

run "budget_and_operator_access" {
  command = plan
  variables {
    billing_account_id = "012ABC-345DEF-678ABC"
    admin_members      = ["user:operator@example.com"]
  }
  assert {
    condition     = length(google_billing_budget.app) == 1 && google_billing_budget.app[0].budget_filter[0].credit_types_treatment == "EXCLUDE_ALL_CREDITS"
    error_message = "The optional budget must monitor usage before trial credits hide it."
  }
  assert {
    condition     = length(google_project_iam_member.operator) == 2 && length(google_iap_tunnel_instance_iam_member.operator) == 1 && length(google_service_account_iam_member.operator) == 1
    error_message = "Configured administrators need OS Login, discovery, IAP, and service-account attachment access."
  }
}

run "smaller_vm_is_an_explicit_choice" {
  command = plan
  variables { machine_type = "e2-micro" }
  assert {
    condition     = google_compute_instance.app.machine_type == "e2-micro" && google_compute_disk.boot.size == 30
    error_message = "A resize must not change the persistent disk footprint."
  }
}

run "reject_mismatched_zone" {
  command = plan
  variables { zone = "europe-west1-b" }
  expect_failures = [var.zone]
}

run "reject_domain_with_path" {
  command = plan
  variables { domain = "https://fantasybuilder.es/auth" }
  expect_failures = [var.domain]
}

run "main_ci_publisher_has_scoped_access" {
  command = plan
  variables {
    github_actions = {
      repository    = "example/fantasybuilder"
      repository_id = "123456789"
    }
  }
  assert {
    condition     = google_artifact_registry_repository_iam_member.image_writer[0].role == "roles/artifactregistry.writer" && google_service_account_iam_member.github_publisher[0].role == "roles/iam.workloadIdentityUser"
    error_message = "CI must use federation and repository-scoped writer access."
  }
  assert {
    condition = alltrue([for restriction in [
      "assertion.repository_id == '123456789'",
      "assertion.repository == 'example/fantasybuilder'",
      "assertion.ref == 'refs/heads/main'",
      "assertion.event_name == 'push'",
      "assertion.workflow_ref == 'example/fantasybuilder/.github/workflows/ci.yml@refs/heads/main'",
    ] : strcontains(google_iam_workload_identity_pool_provider.github[0].attribute_condition, restriction)])
    error_message = "Federation must reject forks, PRs, other branches, workflows, and recreated repositories."
  }
  assert {
    condition     = contains(keys(google_project_service.required), "iamcredentials.googleapis.com") && contains(keys(google_project_service.required), "sts.googleapis.com")
    error_message = "Enable token exchange and service-account impersonation APIs when CI is enabled."
  }
}

run "reject_non_numeric_github_id" {
  command = plan
  variables {
    github_actions = {
      repository    = "example/fantasybuilder"
      repository_id = "not-an-id"
    }
  }
  expect_failures = [var.github_actions]
}
