# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [1.0.3] - 2026-03-15

Please note: This version have some major changes.

### Added

- **Robust Error Handling**: Improved error propagation and retry logic in HTTP layer
- **Background Prediction & Polling**: Support for running predictions asynchronously and polling for results
- **Queue/Dispatch**: Added queue management for predictions
- **Progress Callback**: Receive progress updates during prediction
- **LLM-Friendly JSDoc**: All methods documented for AI/LLM consumption
- **Models & Predictions Sub-APIs**: `skytells.models` and `skytells.predictions` APIs
- **Next.js/Edge Support**: Custom fetch option for cache workaround
- **Detailed Documentation**: Added docs/SDK.md with full API reference and usage

### Changed

- **Method Renaming**: `listModels` → `models.list`, `listPredictions` → `predictions.list`, `getModel` → `models.get`
- **Deprecation Warnings**: Deprecated legacy methods with runtime warnings
- **SDK Entry Point Refactor**: `createClient` renamed to `Skytells`, now default and named export
- **Expanded ClientOptions**: Added timeout, retry, headers, fetch
- **Prediction Object**: Now supports `cancel()`, `delete()`, `wait()`, `onProgress()`

### Fixed

- **Compatibility**: Improved Next.js/Edge compatibility
- **Documentation**: Fixed and expanded API docs

### Removed

- Deprecated legacy method names (still available with warnings)

### Notes

- See docs/SDK.md for full API reference and usage examples.


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
