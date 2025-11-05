# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2024-12-19

### Added

- **New Model Schema Support**: Updated `Model` interface to match the latest API schema
  - Added `Vendor` interface with vendor information (name, description, image_url, verified, slug, metadata)
  - Added `Pricing` interface with support for conditional pricing via `criterias` array
  - Added `PricingCriteria` interface for conditional pricing rules
  - Added `Service` interface for partner model service information
  - Added `ModelType` enum (IMAGE, VIDEO)
  - Added `PricingOperator` enum (EQUALS)
  - Added `PricingUnit` enum for common pricing units
  - Added `img_url` field to Model interface
  - Added `capabilities` array field to Model interface
  - Added optional `service` field for partner models

### Changed

- **Breaking**: `vendor` field changed from `string | undefined` to required `Vendor` object
- **Breaking**: Added required `capabilities` field (array of strings)
- `type` field now uses `ModelType` enum instead of plain string
- `privacy` field now uses `ModelPrivacy` enum instead of plain string
- `pricing` field structure updated to support conditional pricing with `criterias`
