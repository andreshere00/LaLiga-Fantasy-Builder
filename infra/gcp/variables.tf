variable "project_id" {
  description = "Existing GCP project with billing enabled. Terraform does not create or link billing accounts."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Use a valid GCP project ID."
  }
}

variable "name_prefix" {
  description = "Short prefix for application resources and secret names."
  type        = string
  default     = "fantasybuilder"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,18}[a-z0-9]$", var.name_prefix))
    error_message = "Use 4–20 lowercase letters, digits, or hyphens, starting with a letter and ending with a letter/digit."
  }
}

variable "region" {
  description = "Keep us-central1 for the cost baseline; other regions need a fresh estimate."
  type        = string
  default     = "us-central1"
  validation {
    condition     = can(regex("^[a-z]+(-[a-z]+)+[0-9]+$", var.region))
    error_message = "Use a GCP region name such as us-central1."
  }
}

variable "zone" {
  description = "Compute zone in the selected region."
  type        = string
  default     = "us-central1-a"
  validation {
    condition     = can(regex("^${var.region}-[a-z]$", var.zone))
    error_message = "The zone must belong to region."
  }
}

variable "domain" {
  description = "Exact public DNS name, without protocol, port, path, or wildcard. DNS stays with the registrar."
  type        = string
  default     = "fantasybuilder.es"
  validation {
    condition     = length(var.domain) <= 253 && can(regex("^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,63}$", var.domain))
    error_message = "Use an ordinary lowercase DNS hostname such as fantasybuilder.es."
  }
}

variable "machine_type" {
  description = "Initial size for four concurrent users; validate e2-micro before downsizing."
  type        = string
  default     = "e2-small"
  validation {
    condition     = contains(["e2-micro", "e2-small", "e2-medium"], var.machine_type)
    error_message = "Choose e2-micro, e2-small, or e2-medium."
  }
}

variable "boot_disk_size_gb" {
  description = "Total standard disk allowance includes OS, images, PostgreSQL, and Caddy data. Disks cannot shrink."
  type        = number
  default     = 30
  validation {
    condition     = var.boot_disk_size_gb >= 30 && floor(var.boot_disk_size_gb) == var.boot_disk_size_gb
    error_message = "Use an integer disk size of at least 30 GiB."
  }
}

variable "boot_disk_type" {
  description = "pd-standard matches the free-tier storage assumption; pd-balanced costs extra."
  type        = string
  default     = "pd-standard"
  validation {
    condition     = contains(["pd-standard", "pd-balanced"], var.boot_disk_type)
    error_message = "Choose pd-standard or pd-balanced."
  }
}

variable "deletion_protection" {
  description = "Protect the VM against accidental deletion. The persistent disk has a separate prevent_destroy guard."
  type        = bool
  default     = true
}

variable "admin_members" {
  description = "Trusted user:email or group:email principals for OS Login, IAP SSH, and acting as the VM service account."
  type        = set(string)
  default     = []
  validation {
    condition     = alltrue([for member in var.admin_members : can(regex("^(user|group):[^ ]+@[^ ]+$", member))])
    error_message = "Only explicit user:email or group:email principals are supported."
  }
}

variable "backup_retention_days" {
  description = "Delete database backup objects after this many days; lifecycle deletion is asynchronous."
  type        = number
  default     = 14
  validation {
    condition     = var.backup_retention_days >= 1 && var.backup_retention_days <= 365 && floor(var.backup_retention_days) == var.backup_retention_days
    error_message = "Choose a whole number from 1 to 365."
  }
}

variable "billing_account_id" {
  description = "Optional existing billing account ID for a project budget. Requires billing-account permissions."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.billing_account_id == null ? true : can(regex("^[A-Fa-f0-9]{6}-[A-Fa-f0-9]{6}-[A-Fa-f0-9]{6}$", var.billing_account_id))
    error_message = "Use a billing account ID in XXXXXX-XXXXXX-XXXXXX format, or null."
  }
}

variable "monthly_budget" {
  description = "Optional budget amount in the billing account's currency; an alert is not a spending cap."
  type        = number
  default     = 20
  validation {
    condition     = var.monthly_budget > 0 && floor(var.monthly_budget) == var.monthly_budget
    error_message = "Use a positive whole budget amount."
  }
}

variable "budget_currency" {
  description = "Currency of the billing account when the optional budget is enabled."
  type        = string
  default     = "USD"
  validation {
    condition     = can(regex("^[A-Z]{3}$", var.budget_currency))
    error_message = "Use an uppercase ISO currency code matching the billing account."
  }
}
